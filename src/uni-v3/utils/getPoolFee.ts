import { BigNumber, Contract } from "ethers";

export async function findPoolAndFee(
  quoterContract: Contract,
  tokenAAddress: string,
  tokenBAddress: string,
  swapAmount: BigNumber,
  slippage: number
) {
  let poolFee: Number = 0;

  poolFee = await getPoolFee(
    tokenAAddress,
    tokenBAddress,
    swapAmount,
    quoterContract,
    slippage
  );

  return poolFee;
}

export async function getAmountOut(
  tokenA: string,
  tokenB: string,
  poolFee: Number,
  swapAmount: BigNumber,
  quoterContract: Contract,
  slippage: any
) {
  try {
    let slippageTolerance = slippage;

    let expectedAmountB = await quoterContract.callStatic.quoteExactInputSingle(
      tokenA,
      tokenB,
      poolFee,
      swapAmount.toString(),
      0
    );

    // console.log(
    //   `Amount A: ${swapAmount.toString()}`,
    //   `Expected amount B: ${expectedAmountB.toString()}`,
    //   `Pool Fee: ${poolFee}`,
    //   `Slippage Tolerance: ${slippageTolerance}`
    // );

    let minimumAmountB = expectedAmountB
      .mul(10000 - slippageTolerance)
      .div(10000);

    return minimumAmountB;
  } catch (e) {
    return false;
  }
}

export async function getPoolFee(
  tokenAAddress: string,
  tokenBAddress: string,
  swapAmount: BigNumber,
  quoterContract: Contract,
  slippage: number
): Promise<number> {
  const poolFees = [100, 500, 3000, 10000];
  let bestPoolFee = 0;
  let minimumAmountBSoFar = null;

  for (const _poolFee of poolFees) {
    let minimumAmountB = await getAmountOut(
      tokenAAddress,
      tokenBAddress,
      _poolFee,
      swapAmount,
      quoterContract,
      slippage
    );

    if (
      minimumAmountB &&
      (minimumAmountBSoFar === null || minimumAmountB.gt(minimumAmountBSoFar))
    ) {
      bestPoolFee = _poolFee;
      minimumAmountBSoFar = minimumAmountB;
    }
  }

  return bestPoolFee;
}
