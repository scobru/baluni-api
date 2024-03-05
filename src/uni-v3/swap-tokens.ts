import { Contract, Wallet, ethers } from "ethers";
import erc20Abi from "../../abis/ERC20.json";
import swapRouterAbi from "../../abis/SwapRouter.json";
import quoterAbi from "../../abis/Quoter.json";
import { PROTOCOLS, NETWORKS, INFRA } from "../constants";
import { BigNumber } from "bignumber.js";
import env from "dotenv";

env.config();

export async function swap(
  address: string,
  token0: string,
  token1: string,
  reverse: string,
  protocol: string,
  chainId: number,
  amount: number
) {
  console.log(address, token0, token1, reverse, protocol, chainId, amount);

  const batcher = INFRA[chainId].BATCHER;

  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const wallet = new Wallet(String(process.env.PRIVATE_KEY), provider);

  const tokenAAddress = reverse == "true" ? token1 : token0;
  const tokenBAddress = reverse == "true" ? token0 : token1;

  const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenBContract = new Contract(tokenBAddress, erc20Abi, wallet);

  const swapRouterContract = new Contract(
    String(PROTOCOLS[chainId][protocol].ROUTER),
    swapRouterAbi,
    wallet
  );

  const balance = await tokenAContract.balanceOf(address!);

  const calldataApprovalSenderToUniRouter =
    tokenAContract.interface.encodeFunctionData("approve", [
      String(PROTOCOLS[chainId][protocol].ROUTER),
      balance,
    ]);

  const approvalSenderToUniRouter = {
    to: tokenAAddress,
    value: 0,
    data: calldataApprovalSenderToUniRouter,
  };

  const calldataApprovalSenderToBatcher =
    tokenAContract.interface.encodeFunctionData("approve", [batcher, balance]);

  const approvalSenderToBatcher = {
    to: tokenAAddress,
    value: 0,
    data: calldataApprovalSenderToBatcher,
  };

  const calldataTransferFromSenderToBatcher =
    tokenAContract.interface.encodeFunctionData("transferFrom", [
      address!,
      batcher,
      balance,
    ]);

  const transferFromSenderToBatcher = {
    to: tokenAAddress,
    value: 0,
    data: calldataTransferFromSenderToBatcher,
  };

  const calldataApproveBatcherToUniRouter =
    tokenAContract.interface.encodeFunctionData("approve", [
      PROTOCOLS[chainId][protocol].ROUTER as string,
      balance,
    ]);

  const approvalBatcherToUniRouter = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveBatcherToUniRouter,
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

  const minimumAmountB: string = String(
    (Number(expectedAmountB) * (10000 - slippageTolerance)) / 10000
  );

  const swapTxInputs = [
    tokenAAddress,
    tokenBAddress,
    3000,
    address!,
    swapDeadline,
    adjAmount,
    minimumAmountB,
    0,
  ];

  const calldataSwapBatcherToUniRouter =
    swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
      swapTxInputs,
    ]);

  const swapBatcherToUniRouter = {
    to: PROTOCOLS[chainId][protocol].ROUTER as string,
    value: 0,
    data: calldataSwapBatcherToUniRouter,
  };

  return {
    SENDER: {
      approvalSenderToBatcher,
      approvalSenderToUniRouter,
    },
    BATCHER: {
      transferFromSenderToBatcher,
      approvalBatcherToUniRouter,
      swapBatcherToUniRouter,
    },
  };
}
