import { Contract, Wallet, ethers } from "ethers";
import erc20Abi from "../abis/ERC20.json";
import swapRouterAbi from "../abis/SwapRouter.json";
import quoterAbi from "../abis/Quoter.json";
import { PROTOCOLS, NETWORKS } from "./constants";
import { BigNumber } from "bignumber.js";
import env from "dotenv";

env.config();

const router = "0xA7d0bdC6235a745d283aCF6b036b54E77AFFCAd5";

export async function swap(
  address: string,
  token0: string,
  token1: string,
  amount: number,
  reverse: string,
  protocol: string,
  chainId: number
) {
  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const wallet = new Wallet(process.env.PRIVATE_KEY as string, provider);

  const tokenAAddress = reverse == "true" ? token1 : token0;
  const tokenBAddress = reverse == "true" ? token0 : token1;
  const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenBContract = new Contract(tokenBAddress, erc20Abi, wallet);
  const swapRouterAddress = PROTOCOLS[chainId][protocol].ROUTER as string; // polygon

  const swapRouterContract = new Contract(
    swapRouterAddress,
    swapRouterAbi,
    wallet
  );

  const providerGasPrice = await provider.getFeeData();
  const gasPrice: any = providerGasPrice?.gasPrice;
  const balance = await tokenAContract.balanceOf(address);

  const calldataTransferFrom = tokenAContract.interface.encodeFunctionData(
    "transferFrom",
    [address, router, balance]
  );

  const transferFromTx = {
    to: tokenAAddress,
    value: 0,
    data: calldataTransferFrom,
  };

  const calldataApproveRouterToUni =
    tokenAContract.interface.encodeFunctionData("approve", [
      swapRouterAddress,
      ethers.constants.MaxUint256,
    ]);

  const approvalRouterToUni = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveRouterToUni,
  };

  const calldataApproveRouter = tokenAContract.interface.encodeFunctionData(
    "approve",
    [router, ethers.constants.MaxUint256]
  );

  const approvalToRouter = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveRouter,
  };

  const calldataApproveUni = tokenAContract.interface.encodeFunctionData(
    "approve",
    [swapRouterContract, ethers.constants.MaxUint256]
  );

  const approvalToUni = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveUni,
  };

  const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
  const quoterAddress = PROTOCOLS[chainId][protocol].QUOTER as string;
  const quoterContract = new Contract(quoterAddress, quoterAbi, wallet);
  const slippageTolerance = 50;

  let adjAmount;

  if (tokenAContract.decimals == 18 && tokenBContract.decimals == 18) {
    adjAmount = balance;
  } else if (tokenAContract.decimals == 18 && tokenBContract.decimals == 6) {
    adjAmount = balance * 1000000;
  } else if (tokenAContract.decimals == 6 && tokenBContract.decimals == 18) {
    adjAmount = balance / 1000000;
  } else {
    adjAmount = balance;
  }

  const expectedAmountB: BigNumber =
    await quoterContract?.callStatic?.quoteExactInputSingle?.(
      tokenAAddress,
      tokenBAddress,
      3000,
      adjAmount,
      0
    );

  const minimumAmountB =
    (Number(expectedAmountB) * (10000 - slippageTolerance)) / 10000;

  const swapTxInputs = [
    tokenAAddress,
    tokenBAddress,
    3000,
    address,
    swapDeadline,
    adjAmount,
    minimumAmountB, // BigNumber.from(0),
    0,
  ];

  const calldataSwap = swapRouterContract.interface.encodeFunctionData(
    "exactInputSingle",
    [swapTxInputs]
  );

  const swapTx = {
    to: swapRouterAddress,
    value: 0,
    data: calldataSwap,
  };

  // create a batch of transactions
  const txs = {
    approvalToRouter,
    approvalToUni,
    transferFromTx,
    approvalRouterToUni,
    swapTx,
  };

  return txs;
}
