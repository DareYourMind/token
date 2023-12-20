import { BigNumber, utils } from 'ethers';

export const toETH = (value: number): BigNumber => {
  return utils.parseEther(value.toString());
};

export const toUSDC = (value: number): BigNumber => {
  return utils.parseUnits(value.toString(), 6);
};

export const toNumber = (value: BigNumber, decimals?: number): number => {
  return parseFloat(utils.formatUnits(value, decimals || 18))
}