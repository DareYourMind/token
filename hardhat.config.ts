
 import dotenv from 'dotenv'
 dotenv.config({path:__dirname+'/.env'})
 import "@nomiclabs/hardhat-waffle";
 import "@nomiclabs/hardhat-etherscan";
 import "@nomiclabs/hardhat-ethers";
 import 'hardhat-contract-sizer';
 import 'hardhat-abi-exporter';
 import '@typechain/hardhat'
import { HardhatUserConfig } from 'hardhat/types/config';
import { ethers } from 'ethers';


 const {
  CONTRACT_OWNER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  ALCHEMY_GOERLI_API_KEY,
  ALCHEMY_ETHEREUM_API_KEY
} = process.env;

function generateRandomAccounts(numAccounts: number) {
  const accounts = [];
  for (let i = 0; i < numAccounts; i++) {
    const wallet = ethers.Wallet.createRandom();
    accounts.push({
      privateKey: wallet.privateKey,
      balance: "10000000000000000000000000", // Set initial balance to 100 ETH
    });
  }
  return accounts;
}
 
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
    }
  },
  defaultNetwork: "localhost",
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,  // Set base fee to 0 for predictable gas prices
      accounts: generateRandomAccounts(10),
    },
    localhost: {},
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${ALCHEMY_GOERLI_API_KEY}`,
      accounts: [CONTRACT_OWNER_PRIVATE_KEY as string]
    },
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_ETHEREUM_API_KEY}`,
      accounts: [CONTRACT_OWNER_PRIVATE_KEY as string]
    }
  },
  mocha: {
    timeout: 20000
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [],
  },
  paths: {
    root: "./src",
    tests: "./test",
    artifacts: "./artifacts",
    cache: "../cache",
  },
  typechain: {
    outDir: './types/',
    target: 'ethers-v5'
  },
  abiExporter: {
    path: './abi',
    runOnCompile: true,
    flat: true,
    spacing: 2,
    pretty: true,
    only: [
      ":PingPong$",
      ":WETH$",
      ":MarketingSplitter$",
      ":IUniswapFactory$",
      ":IUniswapRouter02$",
      ":IUniswapPair$"
    ]
  }

};

export default config;