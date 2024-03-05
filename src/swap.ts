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
  reverse: string,
  protocol: string,
  chainId: number,
  amount: number
) {
  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const wallet = new Wallet(process.env.PRIVATE_KEY as string, provider);

  const tokenAAddress = reverse == "true" ? token1 : token0;
  const tokenBAddress = reverse == "true" ? token0 : token1;

  const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenBContract = new Contract(tokenBAddress, erc20Abi, wallet);

  const swapRouterContract = new Contract(
    PROTOCOLS[chainId][protocol].ROUTER as string,
    swapRouterAbi,
    wallet
  );

  const balance = await tokenAContract.balanceOf(address);

  const calldataTransferFromSenderToRouter =
    tokenAContract.interface.encodeFunctionData("transferFrom", [
      address,
      router,
      balance,
    ]);

  const transferFromSenderToRouter = {
    to: tokenAAddress,
    value: 0,
    data: calldataTransferFromSenderToRouter,
  };

  const calldataApproveRouterToUni =
    tokenAContract.interface.encodeFunctionData("approve", [
      PROTOCOLS[chainId][protocol].ROUTER as string,
      balance,
    ]);

  const approvalRouterToUni = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveRouterToUni,
  };

  const calldataApproveSenderToRouter =
    tokenAContract.interface.encodeFunctionData("approve", [router, balance]);

  const approvalSenderToRouter = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveSenderToRouter,
  };

  const calldataApproveSenderToUni =
    tokenAContract.interface.encodeFunctionData("approve", [
      swapRouterContract,
      balance,
    ]);

  const approvalSenderToUni = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveSenderToUni,
  };

  const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
  const quoterAddress = PROTOCOLS[chainId][protocol].QUOTER as string;
  const quoterContract = new Contract(quoterAddress, quoterAbi, wallet);
  const slippageTolerance = 100;

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
    minimumAmountB,
    0,
  ];

  const calldataSwapRouterToUni =
    swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
      swapTxInputs,
    ]);

  const swapRouterToUni = {
    to: PROTOCOLS[chainId][protocol].ROUTER as string,
    value: 0,
    data: calldataSwapRouterToUni,
  };

  return {
    approvalSenderToRouter,
    approvalSenderToUni,
    transferFromSenderToRouter,
    approvalRouterToUni,
    swapRouterToUni,
  };
}
