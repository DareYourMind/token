import '@nomiclabs/hardhat-ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { BigNumber, ContractFactory } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { ERC20, Mind } from '../types';
import { toETH, toNumber } from '../util/parser';
import { IUniswapV2Factory } from '../types/@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory';
import { IUniswapV2Router02 } from '../types/@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02';
import { IUniswapPair } from '../types/contracts/uniswap/IUniswapPair';
import { getLatestTimestamp } from '../util/time';

chai.use(chaiAsPromised);
const { expect } = chai;

const provider = waffle.provider;

const totalSupply = parseInt(process.env.TOTAL_SUPPLY)
const ethLiquidity = 23645

describe('Token', () => {
  let signer: SignerWithAddress;
  let marketing: SignerWithAddress;
  let dev: SignerWithAddress;
  let manager: SignerWithAddress;
  let receiver: SignerWithAddress;

  let mindToken: Mind;
  let factory: IUniswapV2Factory;
  let router: IUniswapV2Router02;
  let pair: IUniswapPair;
  let weth: ERC20;
  let wethAddress: string

  let timestamp: number

  beforeEach(async () => {
    [signer, marketing, dev, manager, receiver] = await ethers.getSigners();

    const tokenFactory = (await ethers.getContractFactory('Mind', signer)) as ContractFactory;
    factory = await ethers.getContractAt('IUniswapV2Factory', process.env.UNISWAP_FACTORY, signer);
    router = await ethers.getContractAt('IUniswapV2Router02', process.env.UNISWAP_ROUTER, signer);

    mindToken = await tokenFactory.deploy(factory.address, router.address, marketing.address, dev.address, manager.address) as Mind;
    await mindToken.deployed();

    await mindToken.addLiquidity(toETH(totalSupply), { value: toETH(ethLiquidity) })

    wethAddress = await router.WETH();
    weth = await ethers.getContractAt('ERC20', wethAddress, signer) as ERC20;

    pair = await ethers.getContractAt('IUniswapPair', await factory.getPair(mindToken.address, wethAddress), signer) as IUniswapPair;

    expect(await mindToken.taxExcluded(marketing.address)).to.be.true
    expect(await mindToken.taxExcluded(dev.address)).to.be.true
    expect(await mindToken.taxExcluded(manager.address)).to.be.true
    expect(await mindToken.taxExcluded(mindToken.address)).to.be.true

    timestamp = (await getLatestTimestamp()).toNumber() 

    await mindToken.renounceOwnership()

  });

  it('Checks Liquidity Added', async () => {
    expect(await mindToken.pair()).to.be.equal(pair.address)

    const reserves = await getReserves(pair);

    //taken from line 119 https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol
    const lpTokensExtectedSupply = Math.sqrt(toNumber(reserves[0]) * toNumber(reserves[1]));

    const pairSupply = toNumber(await pair.totalSupply() );
    const pairLpHolderBalance = toNumber(await pair.balanceOf(mindToken.address));
    const pairWethBalance = toNumber(await weth.balanceOf(pair.address));
    const pairTokenBalance = toNumber(await mindToken.balanceOf(pair.address));

    expect(pairSupply).to.be.equal(lpTokensExtectedSupply)
    // expect(pairLpHolderBalance).to.be.equal(lpTokensExtectedSupply)
    // expect(pairWethBalance).to.be.equal(ethLiquidity)
    // expect(pairTokenBalance).to.be.equal(toNumber(reserves[0]))

    // expect(toNumber(reserves[0])).to.be.equal(totalSupply - totalSupply*5/100)
    // expect(toNumber(reserves[1])).to.be.equal(ethLiquidity)
    // expect(reserves[2]).to.be.equal(timestamp)
  });



  // it.only("Checks liquidity can be removed if < 100X", async () => {
  //   console.log(toNumber(await pair.totalSupply()));
  //   console.log(toNumber(await pair.balanceOf(mindToken.address)));
  //   console.log(toNumber(await mindToken.pairBalance()));
  //   console.log(await provider.getBalance(mindToken.address))
  //   await mindToken.connect(manager).removeLiquidity({gasLimit: "7000000"});
  //   console.log(toNumber(await pair.totalSupply()));
  //   console.log(toNumber(await pair.balanceOf(mindToken.address)));
  //   console.log(toNumber(await mindToken.pairBalance()));
  //   console.log(toNumber(await provider.getBalance(mindToken.address)))
  //   // console.log(weth.balanceOf(manager.address))
  // })

  // it('Buys tokens', async () => {
  //   timestamp = (await getLatestTimestamp()).toNumber()
  //   const reserves = await getReserves(pair);

  //   const expectedAmountWithoutFees = toNumber(await router.getAmountOut(toETH(10), reserves[1], reserves[0]));
  //   const expectedFeeCollected = expectedAmountWithoutFees * 5 / 100;
  //   const expectedAmountWithFees = expectedAmountWithoutFees - expectedFeeCollected;

  //   await router.connect(user1).functions.swapExactETHForTokensSupportingFeeOnTransferTokens(
  //     0,
  //     [wethAddress, mindToken.address],
  //     user1.address,
  //     timestamp + 1,
  //     { value: toETH(10) }
  //   )
  //   const user1BalanceAfterTrade = toNumber(await mindToken.balanceOf(user1.address));
  //   expect(user1BalanceAfterTrade).to.be.equal(expectedAmountWithFees)

  //   const tokenContractBalanceAfterTrade = toNumber(await mindToken.balanceOf(mindToken.address));
  //   expect(tokenContractBalanceAfterTrade).to.be.equal(expectedFeeCollected)
  // })

  // it('Sells tokens', async () => {
  //   timestamp = (await getLatestTimestamp()).toNumber()
  //   let reserves = await getReserves(pair);

  //   const expectedBuyAmountWithoutFees = toNumber(await router.getAmountOut(toETH(10), reserves[1], reserves[0]));
  //   let expectedFeeCollected = expectedBuyAmountWithoutFees * 5 / 100;
  //   const expectedBuyAmountWithFees = expectedBuyAmountWithoutFees - expectedFeeCollected;

  //   let pairSupplyBefore = toNumber(await mindToken.balanceOf(pair.address));
  //   let pairEthBalanceBefore = toNumber(await weth.balanceOf(pair.address))

  //   await router.connect(user2).functions.swapExactETHForTokensSupportingFeeOnTransferTokens(
  //     0,
  //     [wethAddress, mindToken.address],
  //     user2.address,
  //     timestamp + 1,
  //     { value: toETH(10) }
  //   )
  //   const user2BalanceAfterBuyTrade = toNumber(await mindToken.balanceOf(user2.address));
  //   expect(user2BalanceAfterBuyTrade).to.be.equal(expectedBuyAmountWithFees)

  //   const tokenContractBalanceAfterBuyTrade = toNumber(await mindToken.balanceOf(mindToken.address));
  //   expect(tokenContractBalanceAfterBuyTrade).to.be.equal(expectedFeeCollected);

  //   let pairSupplyAfter = toNumber(await mindToken.balanceOf(pair.address));
  //   let pairEthBalanceAfter = toNumber(await weth.balanceOf(pair.address))

  //   expect(pairSupplyAfter).to.be.equal(pairSupplyBefore - tokenContractBalanceAfterBuyTrade - user2BalanceAfterBuyTrade)
  //   expect(pairEthBalanceAfter).to.be.equal(pairEthBalanceBefore + 10)


  //   //***************Init Token Sell */
  //   //start token sell
  //   reserves = await getReserves(pair);
  //   await mindToken.connect(user2).approve(router.address, toETH(user2BalanceAfterBuyTrade));
  //   timestamp = (await getLatestTimestamp()).toNumber()

  //   const tokensToSell = user2BalanceAfterBuyTrade - user2BalanceAfterBuyTrade * 0.2 / 100
  //   expectedFeeCollected = tokensToSell * 5 / 100
  //   const expectedETHAmountWithFees = toNumber(await router.getAmountOut(toETH(tokensToSell - expectedFeeCollected), reserves[0], reserves[1]))
  //   const receiverEHTBalanceBeforeTrade = toNumber(await ethers.provider.getBalance(receiver.address))

  //   await router.connect(user2).functions.swapExactTokensForETHSupportingFeeOnTransferTokens(
  //     toETH(tokensToSell),
  //     0,
  //     [mindToken.address, wethAddress],
  //     receiver.address,
  //     timestamp + 1
  //   )

  //   const receiverETHBalanceAfterTrade = toNumber(await ethers.provider.getBalance(receiver.address));
  //   expect(receiverETHBalanceAfterTrade.toFixed(10)).to.be.equal((receiverEHTBalanceBeforeTrade + expectedETHAmountWithFees).toFixed(10))

  //   const tokenContractBalanceAfterSellTrade = toNumber(await mindToken.balanceOf(mindToken.address))
  //   expect(tokenContractBalanceAfterSellTrade).to.be.equal(tokenContractBalanceAfterBuyTrade + expectedFeeCollected)

  //   /************Init swap All  */

  //   reserves = await getReserves(pair);

  //   const amountToSwap = tokenContractBalanceAfterSellTrade - tokenContractBalanceAfterSellTrade*0.2
  //   const expectedEthAmountFromContractSwap = toNumber(await router.getAmountOut(toETH(amountToSwap), reserves[0], reserves[1]));

  //   const tx = await (await mindToken.swapAll()).wait()

  //   const marketinSwapEvent = tx.events.find(e => e.event === "SwapMarketing")
  //   const LiquidityEventEvent = tx.events.find(e => e.event === "Liquify")

  //   const marketingSwappedAmount = toNumber(marketinSwapEvent.args[0])
  //   const marketingEthReceived = toNumber(marketinSwapEvent.args[1])
  //   const liquiditySwappedAmount = toNumber(LiquidityEventEvent.args[0])
  //   const liquidityEthReceived = toNumber(LiquidityEventEvent.args[1])

  //   expect(marketingSwappedAmount + liquiditySwappedAmount*2).to.be.equal(tokenContractBalanceAfterSellTrade)
  //   expect(toNumber(await ethers.provider.getBalance(mindToken.address))).to.be.equal(0)

  // })
});

export const getReserves = async (pair: IUniswapPair): Promise<[BigNumber, BigNumber, number]> => {
  const reserves = await pair.getReserves();
  return reserves[0].gt(reserves[1]) ? [reserves[0], reserves[1], reserves[2]] : [reserves[1], reserves[0], reserves[2]]
}