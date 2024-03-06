import { Contract, Wallet, ethers } from "ethers";
import erc20Abi from "../../abis/common/ERC20.json";
import swapRouterAbi from "../../abis/uniswap/SwapRouter.json";
import quoterAbi from "../../abis/uniswap/Quoter.json";
import { PROTOCOLS, NETWORKS, INFRA } from "../constants";
import { BigNumber } from "bignumber.js";
import {
  AllowanceProvider,
  AllowanceTransfer,
  PERMIT2_ADDRESS,
  PermitSingle,
  MaxAllowanceTransferAmount,
} from "@uniswap/permit2-sdk";

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

  const batcher = String(INFRA[chainId].BATCHER);
  const router = String(PROTOCOLS[chainId][protocol].ROUTER);

  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const wallet = new Wallet(String(process.env.PRIVATE_KEY), provider);

  const tokenAAddress = reverse == "true" ? token1 : token0;
  const tokenBAddress = reverse == "true" ? token0 : token1;

  const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);
  const tokenBContract = new Contract(tokenBAddress, erc20Abi, wallet);

  const tokenADecimals = await tokenAContract.decimals();
  const tokenBDecimals = await tokenBContract.decimals();

  console.log("Token A Decimals: ", tokenADecimals);
  console.log("Token B Decimals: ", tokenBDecimals);

  let adjAmount = 0;

  if (tokenADecimals == 18) {
    adjAmount = amount * 1e18;
  } else if (tokenADecimals == 6) {
    adjAmount = amount * 1e6;
  }

  if (adjAmount == 0) {
    throw new Error("Invalid Token Decimals");
  }

  console.log("Adjusted Amount: ", adjAmount);

  // let PermitData = {
  //   ROUTER: {},
  //   BATCHER: {},
  // };

  // if (permit2) {
  //   const allowanceProvider = new AllowanceProvider(provider, PERMIT2_ADDRESS);

  //   let { permitAmountRouter, expirationRouter, nonceRouter } =
  //     (await allowanceProvider.getAllowanceData(
  //       address,
  //       tokenAAddress,
  //       router
  //     )) as any;

  //   //Check permitAmount and expiration
  //   console.log("Permit Amount: ", permitAmountRouter);
  //   console.log("Expiration: ", expirationRouter);
  //   console.log("Nonce: ", nonceRouter);

  //   if (
  //     adjAmount > permitAmountRouter ||
  //     expirationRouter < Math.floor(Date.now() / 1000) ||
  //     permitAmountRouter == undefined
  //   ) {
  //     // const PERMIT_EXPIRATION = `30d`;
  //     // const PERMIT_SIG_EXPIRATION = `30m`;

  //     function toDeadline(expiration: number): number {
  //       return Math.floor((Date.now() + expiration) / 1000);
  //     }

  //     const permitSingle: PermitSingle = {
  //       details: {
  //         token: tokenAAddress,
  //         amount: MaxAllowanceTransferAmount,
  //         // You may set your own deadline - we use 30 days.
  //         expiration: toDeadline(/* 30 days= */ 1000 * 60 * 60 * 24 * 30),
  //         nonce: nonceRouter === undefined ? 1 : nonceRouter,
  //       },
  //       spender: router,
  //       // You may set your own deadline - we use 30 minutes.
  //       sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
  //     };

  //     console.log("Permit Single: ", permitSingle);

  //     const { domain, types, values } = AllowanceTransfer.getPermitData(
  //       permitSingle,
  //       PERMIT2_ADDRESS,
  //       chainId
  //     );

  //     PermitData.ROUTER = {
  //       permitSingle,
  //       domain,
  //       types,
  //       values,
  //     };
  //   }

  //   let { permitAmountBatcher, expirationBatcher, nonceBatcher } =
  //     (await allowanceProvider.getAllowanceData(
  //       address,
  //       tokenAAddress,
  //       batcher
  //     )) as any;

  //   //Check permitAmount and expiration
  //   console.log("Permit Amount: ", permitAmountBatcher);
  //   console.log("Expiration: ", expirationBatcher);
  //   console.log("Nonce: ", nonceBatcher);

  //   if (
  //     adjAmount > permitAmountBatcher ||
  //     expirationBatcher < Math.floor(Date.now() / 1000) ||
  //     permitAmountBatcher == undefined
  //   ) {
  //     // const PERMIT_EXPIRATION = `30d`;
  //     // const PERMIT_SIG_EXPIRATION = `30m`;

  //     function toDeadline(expiration: number): number {
  //       return Math.floor((Date.now() + expiration) / 1000);
  //     }

  //     const permitSingle: PermitSingle = {
  //       details: {
  //         token: tokenAAddress,
  //         amount: MaxAllowanceTransferAmount,
  //         // You may set your own deadline - we use 30 days.
  //         expiration: toDeadline(/* 30 days= */ 1000 * 60 * 60 * 24 * 30),
  //         nonce: nonceBatcher === undefined ? 1 : nonceBatcher,
  //       },
  //       spender: String(PROTOCOLS[chainId][protocol].ROUTER),
  //       // You may set your own deadline - we use 30 minutes.
  //       sigDeadline: toDeadline(/* 30 minutes= */ 1000 * 60 * 60 * 30),
  //     };

  //     const { domain, types, values } = AllowanceTransfer.getPermitData(
  //       permitSingle,
  //       PERMIT2_ADDRESS,
  //       chainId
  //     );

  //     PermitData.BATCHER = {
  //       permitSingle,
  //       domain,
  //       types,
  //       values,
  //     };
  //   }
  // }

  let Approvals = {
    ROUTER: {},
    BATCHER: {},
  };

  const allowanceBatcher = await tokenAContract?.allowance(address, batcher);
  const allowanceRouter = await tokenAContract?.allowance(address, router);

  if (adjAmount > allowanceBatcher) {
    const dataApproveToRouter = tokenAContract.interface.encodeFunctionData(
      "approve",
      [router, adjAmount]
    );

    const approvalToRouter = {
      to: tokenAAddress,
      value: 0,
      data: dataApproveToRouter,
    };

    Approvals["ROUTER"] = approvalToRouter;
  }

  if (adjAmount > allowanceRouter) {
    const dataApproveToBatcher = tokenAContract.interface.encodeFunctionData(
      "approve",
      [batcher, adjAmount]
    );

    const approvalToBatcher = {
      to: tokenAAddress,
      value: 0,
      data: dataApproveToBatcher,
    };

    Approvals["BATCHER"] = approvalToBatcher;
  }

  const swapRouterContract = new Contract(router, swapRouterAbi, wallet);

  // BATCHER CALLS
  const dataTransferFromSenderToBatcher =
    tokenAContract.interface.encodeFunctionData("transferFrom", [
      address!,
      batcher,
      adjAmount,
    ]);

  const transferFromSenderToBatcher = {
    to: tokenAAddress,
    value: 0,
    data: dataTransferFromSenderToBatcher,
  };

  const calldataApproveBatcherToRouter =
    tokenAContract.interface.encodeFunctionData("approve", [
      PROTOCOLS[chainId][protocol].ROUTER as string,
      adjAmount,
    ]);

  const approvalBatcherToRouter = {
    to: tokenAAddress,
    value: 0,
    data: calldataApproveBatcherToRouter,
  };

  const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
  const quoterAddress = PROTOCOLS[chainId][protocol].QUOTER as string;
  const quoterContract = new Contract(quoterAddress, quoterAbi, wallet);

  const slippageTolerance = 50;

  const expectedAmountB: BigNumber =
    await quoterContract?.callStatic?.quoteExactInputSingle?.(
      tokenAAddress,
      tokenBAddress,
      3000,
      adjAmount,
      0
    );

  console.log("Expected Amount B: ", expectedAmountB.toString());

  const minimumAmountB = ethers.BigNumber.from(expectedAmountB)
    .mul(10000 - slippageTolerance)
    .div(10000);

  console.log("Minimum Amount B: ", Number(minimumAmountB));

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

  const calldataSwapBatcherToRouter =
    swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
      swapTxInputs,
    ]);

  const swapBatcherToRouter = {
    to: PROTOCOLS[chainId][protocol].ROUTER as string,
    value: 0,
    data: calldataSwapBatcherToRouter,
  };

  const Calldatas = {
    transferFromSenderToBatcher,
    approvalBatcherToRouter,
    swapBatcherToRouter,
  };

  return {
    Approvals,
    Calldatas,
  };
}
