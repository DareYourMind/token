
 import dotenv from 'dotenv'
 dotenv.config({path:__dirname+'/.env'})
 import "@nomiclabs/hardhat-waffle";
 import "@nomiclabs/hardhat-etherscan";
 import "@nomiclabs/hardhat-ethers";
 import 'hardhat-contract-sizer';
 import 'hardhat-abi-exporter';
 import '@typechain/hardhat'
import { HardhatUserConfig } from 'hardhat/types/config';


 const {
  CONTRACT_OWNER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
  QUICK_NODE_BSC_API_KEY,
  ALCHEMY_MUMBAI_API_KEY
} = process.env;
 
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
    localhost: {},
    bsc: {
      url: `https://powerful-misty-pool.bsc.discover.quiknode.pro/${QUICK_NODE_BSC_API_KEY}/`,
      accounts: [CONTRACT_OWNER_PRIVATE_KEY as string]
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_MUMBAI_API_KEY}`,
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
      ":IPancakeFactory$",
      ":IPancakeRouter02$",
      ":IPancakePair$"
    ]
  }

};

export default config;