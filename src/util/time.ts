import { time } from '@openzeppelin/test-helpers';
import { BigNumber } from 'ethers';

export async function timeIncreaseTo(seconds: number) {
  await time.increaseTo(seconds);
  await time.advanceBlock();
}

export async function getLatestBlock(): Promise<BigNumber> {
  const latestBlock = await time.latestBlock();
  return latestBlock;
}

export async function getLatestTimestamp(): Promise<BigNumber> {
  const latestTimestamp = await time.latest();
  return latestTimestamp;
}
