import '@nomiclabs/hardhat-ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { BigNumber, ContractFactory } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { ERC20, MMPaymentSplitter, Mind, UniswapV2Locker } from '../types';
import { toETH, toNumber } from '../util/parser';
import { IUniswapV2Factory } from '../types/@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory';
import { IUniswapV2Router02 } from '../types/@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02';
import { IUniswapPair } from '../types/contracts/uniswap/IUniswapPair';
import { getLatestTimestamp, timeIncreaseTo } from '../util/time';

chai.use(chaiAsPromised);
const { expect } = chai;

const provider = waffle.provider;

const totalSupply = parseInt(process.env.TOTAL_SUPPLY)
const ethLiquidity = 25
const lockValue = 0.1
const UNCX_LOCKER = "0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214";

describe('Token', () => {
  let signer: SignerWithAddress;
  let marketing: SignerWithAddress;
  let dev: SignerWithAddress;
  let manager: SignerWithAddress;
  let staking: SignerWithAddress;
  let receiver: SignerWithAddress;
  let trader1: SignerWithAddress;
  let trader2: SignerWithAddress;
  let trader3: SignerWithAddress;
  let trader4: SignerWithAddress;

  let splitter: MMPaymentSplitter;
  let mindToken: Mind;
  let factory: IUniswapV2Factory;
  let router: IUniswapV2Router02;
  let pair: IUniswapPair;
  let uncxLocker: UniswapV2Locker;
  let weth: ERC20;
  let wethAddress: string

  let timestamp: number

  beforeEach(async () => {
    [signer, marketing, dev, manager, staking, receiver, trader1, trader2, trader3, trader4] = await ethers.getSigners();

    const tokenFactory = (await ethers.getContractFactory('Mind', signer)) as ContractFactory;
    const splitterFactory = (await ethers.getContractFactory('MMPaymentSplitter', signer)) as ContractFactory;

    factory = await ethers.getContractAt('IUniswapV2Factory', process.env.UNISWAP_FACTORY, signer);
    router = await ethers.getContractAt('IUniswapV2Router02', process.env.UNISWAP_ROUTER, signer);
    uncxLocker = await ethers.getContractAt('UniswapV2Locker', UNCX_LOCKER, signer);

    splitter = await splitterFactory.deploy([dev.address, marketing.address, staking.address], [100, 100, 100]) as MMPaymentSplitter;

    mindToken = await tokenFactory.deploy(factory.address, router.address, splitter.address, manager.address) as Mind;
    await mindToken.deployed();

    await mindToken.addLiquidity(toETH(totalSupply), { value: toETH(ethLiquidity + lockValue) })

    wethAddress = await router.WETH();
    weth = await ethers.getContractAt('ERC20', wethAddress, signer) as ERC20;

    pair = await ethers.getContractAt('IUniswapPair', await factory.getPair(mindToken.address, wethAddress), signer) as IUniswapPair;

    expect(await mindToken.taxExcluded(mindToken.address)).to.be.true

    timestamp = (await getLatestTimestamp()).toNumber()

    await mindToken.renounceOwnership()

  });

  it('Checks Liquidity Added', async () => {
    expect(await mindToken.pair()).to.be.equal(pair.address)

    const reserves = await getReserves(pair);

    //taken from line 119 https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol
    let lpTokensExpectedSupply = Math.sqrt(toNumber(reserves[0]) * toNumber(reserves[1]));

    const tokensSupply = toNumber(await mindToken.totalSupply());
    const pairSupply = toNumber(await pair.totalSupply());
    const pairLpHolderBalance = toNumber(await pair.balanceOf(UNCX_LOCKER));
    const pairWethBalance = toNumber(await weth.balanceOf(pair.address));
    const pairTokenBalance = toNumber(await mindToken.balanceOf(pair.address));

    expect(tokensSupply).to.be.equal(totalSupply)
    expect(pairSupply.toFixed(4)).to.be.equal(lpTokensExpectedSupply.toFixed(4));
    expect(pairLpHolderBalance.toFixed(4)).to.be.equal((lpTokensExpectedSupply - lpTokensExpectedSupply * 1 / 100).toFixed(4));
    expect(pairWethBalance).to.be.equal(ethLiquidity)
    expect(pairTokenBalance).to.be.equal(toNumber(reserves[0]))

  });

  it("Checks liquidity can be removed if not volume trading satisfied", async () => {
    const pairLpHolderBalance = toNumber(await pair.balanceOf(UNCX_LOCKER));

    const tokenLocks = await uncxLocker.tokenLocks(pair.address, 0)
    expect(tokenLocks.lockDate).to.be.equal(timestamp);
    expect(toNumber(tokenLocks.amount).toFixed(4)).to.be.equal(pairLpHolderBalance.toFixed(4))
    expect(tokenLocks.unlockDate).to.be.equal(timestamp + 3 * 30 * 24 * 60 * 60);

    await timeIncreaseTo(timestamp + 3 * 30 * 25 * 60 * 60);

    const managerBalanceBefore = toNumber(await provider.getBalance(manager.address));
    const managerTokenBalanceBefore = toNumber(await mindToken.balanceOf(manager.address));
    await mindToken.connect(manager).removeLiquidity(manager.address);
    expect(toNumber(await provider.getBalance(manager.address))).to.be.equal(managerBalanceBefore + (ethLiquidity - ethLiquidity * 1 / 100))
    expect(toNumber(await mindToken.balanceOf(manager.address))).to.be.equal(managerTokenBalanceBefore + (totalSupply - totalSupply * 1 / 100))
  })


  it('Trades tokens', async () => {
    //buy 1
    timestamp = (await getLatestTimestamp()).toNumber()
    let reserves = await getReserves(pair);

    let expectedAmountWithoutFees = toNumber(await router.getAmountOut(toETH(0.5), reserves[1], reserves[0]));
    let expectedFeeCollected = expectedAmountWithoutFees * 3 / 100;
    let expectedAmountWithFees = expectedAmountWithoutFees - expectedFeeCollected;

    let tx = await (await router.connect(trader1).functions.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [wethAddress, mindToken.address],
      trader1.address,
      timestamp + 1,
      { value: toETH(0.5) }
    )).wait();

    console.log("Buy1 gas", tx.gasUsed)
    const user1BalanceAfterTrade = toNumber(await mindToken.balanceOf(trader1.address));
    expect(user1BalanceAfterTrade.toFixed(5)).to.be.equal(expectedAmountWithFees.toFixed(5))

    let tokenContractBalanceAfterTrade = toNumber(await mindToken.balanceOf(mindToken.address));
    expect(tokenContractBalanceAfterTrade.toFixed(5)).to.be.equal(expectedFeeCollected.toFixed(5));


    //buy2
    timestamp = (await getLatestTimestamp()).toNumber()
    reserves = await getReserves(pair);

    expectedAmountWithoutFees = toNumber(await router.getAmountOut(toETH(0.5), reserves[1], reserves[0]));
    expectedFeeCollected = expectedAmountWithoutFees * 3 / 100;
    expectedAmountWithFees = expectedAmountWithoutFees - expectedFeeCollected;
    let contractBalanceBeforeTrade = toNumber(await mindToken.balanceOf(mindToken.address))

    tx = await (await router.connect(trader2).functions.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [wethAddress, mindToken.address],
      trader2.address,
      timestamp + 1,
      { value: toETH(0.5) }
    )).wait();
    console.log("Buy2 gas", tx.gasUsed)
    

    const user2BalanceAfterTrade = toNumber(await mindToken.balanceOf(trader2.address));
    expect(user2BalanceAfterTrade.toFixed(5)).to.be.equal(expectedAmountWithFees.toFixed(5))

    tokenContractBalanceAfterTrade = toNumber(await mindToken.balanceOf(mindToken.address));
    expect(tokenContractBalanceAfterTrade.toFixed(5)).to.be.equal((contractBalanceBeforeTrade + expectedFeeCollected).toFixed(5));

    //sell
    const toSell = user1BalanceAfterTrade/5;
    reserves = await getReserves(pair);
    await mindToken.connect(trader1).approve(router.address, toETH(toSell));
    timestamp = (await getLatestTimestamp()).toNumber()

    expectedFeeCollected = toSell * 3 / 100
    const expectedETHAmountWithFees = toNumber(await router.getAmountOut(toETH(toSell - expectedFeeCollected), reserves[0], reserves[1]))
    const receiverEHTBalanceBeforeTrade = toNumber(await ethers.provider.getBalance(trader1.address))
    contractBalanceBeforeTrade = toNumber(await mindToken.balanceOf(mindToken.address))

    console.log(receiverEHTBalanceBeforeTrade)

    tx = await (await router.connect(trader1).functions.swapExactTokensForETHSupportingFeeOnTransferTokens(
      toETH(toSell),
      0,
      [mindToken.address, wethAddress],
      trader1.address,
      timestamp + 1
    )).wait()
    console.log("Sell1 gas", tx.gasUsed)


    const receiverETHBalanceAfterTrade = toNumber(await ethers.provider.getBalance(trader1.address));
    console.log(receiverETHBalanceAfterTrade)

    const contractBalanceAfterTrade = toNumber(await mindToken.balanceOf(mindToken.address))
    expect(receiverETHBalanceAfterTrade.toFixed(4)).to.be.equal((receiverEHTBalanceBeforeTrade + expectedETHAmountWithFees).toFixed(4))
    expect(contractBalanceAfterTrade.toFixed(5)).to.be.equal((contractBalanceBeforeTrade + expectedFeeCollected - 100000).toFixed(5))

  })

  it.only("Relocks liquidity if trading volume surpases 50x of inital liquidity", async () => {
    await timeIncreaseTo(timestamp + 3 * 30 * 25 * 60 * 60);

    await mindToken.connect(trader1).approve(router.address, toETH(100000000000));
    await mindToken.connect(trader2).approve(router.address, toETH(100000000000));
    await mindToken.connect(trader3).approve(router.address, toETH(100000000000));
    await mindToken.connect(trader4).approve(router.address, toETH(100000000000));

    for(let j = 0; j < 1000; j++) {
      let reserves = await getReserves(pair);
      let value = toNumber(await router.getAmountOut(toETH(0.2 + j/10), reserves[0], reserves[1]))
      let mcap = totalSupply * value * 2500;

      await buy(router, mindToken, splitter, trader1, toETH(0.2 + j/10), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;

      await buy(router, mindToken, splitter, trader2, toETH(0.2 + j/10), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;

      await buy(router, mindToken, splitter, trader3, toETH(0.2 + j/10), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;

      await buy(router, mindToken, splitter, trader4, toETH(0.2 + j/10), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;
  
      await sell(router, mindToken, splitter, trader1, (await mindToken.balanceOf(trader1.address)).div(3), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;

      await sell(router, mindToken, splitter, trader2, (await mindToken.balanceOf(trader2.address)).div(3), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;

      await sell(router, mindToken, splitter, trader3, (await mindToken.balanceOf(trader3.address)).div(3), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;

      await sell(router, mindToken, splitter, trader4, (await mindToken.balanceOf(trader4.address)).div(3), mcap)
      reserves = await getReserves(pair);
      value = toNumber(await router.getAmountOut(toETH(1), reserves[0], reserves[1]))
      mcap = totalSupply * value * 2500;

      console.log("Trades", (j + 1)* 8)
    }
  })


});

const buy = async (router: IUniswapV2Router02, mindToken: Mind, splitter: MMPaymentSplitter, trader: SignerWithAddress, amount: BigNumber, mcap: number) => {
  const wethAddress = await router.WETH();
  const timestamp = (await getLatestTimestamp()).toNumber()
  const tx = await (await router.connect(trader).functions.swapExactETHForTokensSupportingFeeOnTransferTokens(
    0,
    [wethAddress, mindToken.address],
    trader.address,
    timestamp + 10,
    { value: amount }
  )).wait();
  console.log("buy", 
    toNumber(amount),
    toNumber(await mindToken.balanceOf(mindToken.address)), 
    toNumber(await provider.getBalance(mindToken.address)),
    toNumber(await provider.getBalance(splitter.address)),
    mcap
  )
}

const sell = async (router: IUniswapV2Router02, mindToken: Mind, splitter: MMPaymentSplitter,  trader: SignerWithAddress, amount: BigNumber, mcap: number) => {
  const wethAddress = await router.WETH();
  const timestamp = (await getLatestTimestamp()).toNumber()
  const tx = await (await router.connect(trader).functions.swapExactTokensForETHSupportingFeeOnTransferTokens(
    amount,
    0,
    [mindToken.address, wethAddress],
    trader.address,
    timestamp + 10
  )).wait()


  console.log("sell", 
    toNumber(amount),
    toNumber(await mindToken.balanceOf(mindToken.address)), 
    toNumber(await provider.getBalance(mindToken.address)),
    toNumber(await provider.getBalance(splitter.address)),
    mcap
  )
}

export const getReserves = async (pair: IUniswapPair): Promise<[BigNumber, BigNumber, number]> => {
  const reserves = await pair.getReserves();
  return reserves[0].gt(reserves[1]) ? [reserves[0], reserves[1], reserves[2]] : [reserves[1], reserves[0], reserves[2]]
}