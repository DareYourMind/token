import { ethers } from 'ethers';

export function getProvider(web3Provider?: ethers.providers.ExternalProvider): ethers.providers.JsonRpcProvider {
  // return new ethers.providers.Web3Provider(ganache.provider())
  if (web3Provider) {
    return new ethers.providers.Web3Provider(web3Provider);
  } else {
    return new ethers.providers.JsonRpcProvider();
  }
}
