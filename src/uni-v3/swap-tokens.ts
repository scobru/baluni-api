import { Contract, Wallet, ethers } from "ethers";
import erc20Abi from "../abis/common/ERC20.json";
import swapRouterAbi from "../abis/uniswap/SwapRouter.json";
import routerAbi from "../abis/infra/Router.json";
import quoterAbi from "../abis/uniswap/Quoter.json";
import { PROTOCOLS, NETWORKS, INFRA, NATIVETOKENS, USDC } from "../constants";
import { BigNumber } from "bignumber.js";
import { findPoolAndFee } from "./utils/getPoolFee";
import { quotePair } from "./utils/quote";

// import {
//   AllowanceProvider,
//   AllowanceTransfer,
//   PERMIT2_ADDRESS,
//   PermitSingle,
//   MaxAllowanceTransferAmount,
// } from "@uniswap/permit2-sdk";

import env from "dotenv";
import { parseUnits } from "ethers/lib/utils";

env.config();

function getAdjAmount(_amount, _decimals) {
  let _adjAmount;

  if (_decimals == 18) {
    _adjAmount = parseUnits(_amount, 18);
  } else if (_decimals == 6) {
    _adjAmount = parseUnits(_amount, 6);
  } else if (_decimals == 8) {
    _adjAmount = parseUnits(_amount, 8);
  }

  return _adjAmount;
}

export async function buildSwap(
  address: string,
  token0: string,
  token1: string,
  reverse: boolean,
  protocol: string,
  chainId: string,
  amount: string,
  slippage: number
) {
  console.log("Building Swap tx");
  console.log(address, token0, token1, reverse, protocol, chainId, amount);

  const provider = new ethers.providers.JsonRpcProvider(NETWORKS[chainId]);
  const quoter = String(PROTOCOLS[chainId][protocol].QUOTER);
  const router = String(PROTOCOLS[chainId][protocol].ROUTER);
  const swapRouterContract = new Contract(router, swapRouterAbi, provider);
  const infraRouter = String(INFRA[chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, provider);
  const agentAddress = await InfraRouterContract?.getAgentAddress(address);
  const tokenAAddress = reverse == true ? token1 : token0;
  const tokenBAddress = reverse == true ? token0 : token1;
  const tokenAContract = new Contract(tokenAAddress, erc20Abi, provider);
  const tokenBContract = new Contract(tokenBAddress, erc20Abi, provider);
  const tokenADecimals = await tokenAContract.decimals();
  // const tokenBDecimals = await tokenBContract.decimals();

  let adjAmount: any = ethers.BigNumber.from(0);

  console.log("Adj Amount: ", Number(amount));
  console.log("Token A Decimals: ", Number(tokenADecimals));

  if (tokenADecimals == 0) {
    throw new Error("Invalid Token Decimals");
  }

  adjAmount = getAdjAmount(amount, tokenADecimals);

  // adjAmount = ethers.utils.parseUnits(amount, tokenADecimals).toBigInt();

  if (adjAmount == 0) {
    throw new Error("Invalid Token Decimals");
  }

  console.log("Adj Amount: ", Number(adjAmount));

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

  const quoterContract = new Contract(quoter, quoterAbi, provider);
  const quote = await quotePair(tokenAAddress, tokenBAddress, Number(chainId));
  const allowanceRouter = await tokenAContract?.allowance(address, router);
  const allowanceAgent = await tokenAContract?.allowance(address, agentAddress);

  let Approvals = [];
  let Calldatas = [];

  // if (adjAmount > allowanceRouter) {
  //   const dataApproveToRouter = tokenAContract.interface.encodeFunctionData(
  //     "approve",
  //     [router, ethers.BigNumber.from(2).pow(256).sub(1)]
  //   );
  //   const approvalToRouter = {
  //     to: tokenAAddress,
  //     value: 0,
  //     data: dataApproveToRouter,
  //   };
  //   Approvals.push(approvalToRouter);
  // }

  if (allowanceAgent && adjAmount > allowanceAgent) {
    const dataApproveToAgent = tokenAContract.interface.encodeFunctionData(
      "approve",
      [agentAddress, ethers.BigNumber.from(2).pow(256).sub(1)]
    );

    const approvalToAgent = {
      to: tokenAAddress,
      value: 0,
      data: dataApproveToAgent,
    };

    Approvals.push(approvalToAgent);
  }

  // AGENT CALLS
  const dataTransferFromSenderToAgent =
    tokenAContract.interface.encodeFunctionData("transferFrom", [
      address!,
      agentAddress,
      adjAmount,
    ]);

  const transferFromSenderToAgent = {
    to: tokenAAddress,
    value: 0,
    data: dataTransferFromSenderToAgent,
  };

  Calldatas.push(transferFromSenderToAgent);

  //check allowance Agent to Router
  const allowanceAgentToRouter = await tokenAContract?.allowance(
    agentAddress,
    router
  );

  if (allowanceAgentToRouter < adjAmount) {
    const calldataApproveAgentToRouter =
      tokenAContract.interface.encodeFunctionData("approve", [
        router,
        adjAmount,
      ]);

    const approvalAgentToRouter = {
      to: tokenAAddress,
      value: 0,
      data: calldataApproveAgentToRouter,
    };

    Calldatas.push(approvalAgentToRouter);
  }

  const slippageTolerance = slippage;

  if (!quote) {
    console.error("❌ USDC Pool Not Found");
    console.log("↩️ Using WMATIC route");
    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      NATIVETOKENS[chainId].WRAPPED,
      adjAmount,
      slippageTolerance
    );

    const poolFee2 = await findPoolAndFee(
      quoterContract,
      NATIVETOKENS[chainId].WRAPPED,
      tokenBAddress,
      adjAmount,
      slippageTolerance
    );

    let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);

    // let minimumAmountB = await getAmountOut(
    //   tokenAAddress,
    //   NATIVETOKENS[chainId].WRAPPED,
    //   poolFee,
    //   adjAmount,
    //   quoterContract,
    //   50
    // );

    //  let minimumAmountB2 = await getAmountOut(
    //   NATIVETOKENS[chainId].WRAPPED,
    //   USDC[chainId],
    //   poolFee2,
    //   minimumAmountB,
    //   quoterContract,
    //   50
    // );

    const path = ethers.utils.solidityPack(
      ["address", "uint24", "address", "uint24", "address"],
      [
        tokenAAddress,
        poolFee,
        NATIVETOKENS[chainId].WRAPPED,
        poolFee2,
        tokenBAddress,
      ]
    );

    let swapTxInputs = [path, agentAddress, swapDeadline, adjAmount, 0];

    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInput", [
        swapTxInputs,
      ]);

    const swapMultiAgentToRouter = {
      to: PROTOCOLS[chainId][protocol].ROUTER as string,
      value: 0,
      data: calldataSwapAgentToRouter,
    };

    Calldatas.push(swapMultiAgentToRouter);
  } else {
    const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
    const poolFee = await findPoolAndFee(
      quoterContract,
      tokenAAddress,
      tokenBAddress,
      adjAmount,
      slippageTolerance
    );

    const expectedAmountB: BigNumber =
      await quoterContract?.callStatic?.quoteExactInputSingle?.(
        tokenAAddress,
        tokenBAddress,
        poolFee,
        adjAmount,
        0
      );
    const minimumAmountB = ethers.BigNumber.from(expectedAmountB)
      .mul(10000 - slippageTolerance)
      .div(10000);

    const swapTxInputs = [
      tokenAAddress,
      tokenBAddress,
      poolFee,
      agentAddress!,
      swapDeadline,
      adjAmount,
      minimumAmountB,
      0,
    ];
    const calldataSwapAgentToRouter =
      swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
        swapTxInputs,
      ]);
    const swapAgentToRouter = {
      to: PROTOCOLS[chainId][protocol].ROUTER as string,
      value: 0,
      data: calldataSwapAgentToRouter,
    };

    Calldatas.push(swapAgentToRouter);
  }

  const TokensReturn = [tokenBAddress];

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}

export async function buildBatchSwap(
  swaps: Array<{
    address: string;
    token0: string;
    token1: string;
    reverse: boolean;
    protocol: string;
    chainId: string;
    amount: string;
    slippage: number;
  }>
) {
  console.log("Building Batch Swap tx");

  const provider = new ethers.providers.JsonRpcProvider(
    NETWORKS[swaps[0].chainId]
  );
  const infraRouter = String(INFRA[swaps[0].chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, provider);
  const router = String(PROTOCOLS[swaps[0].chainId][swaps[0].protocol].ROUTER);
  const swapRouterContract = new Contract(router, swapRouterAbi, provider);

  const quoter = String(PROTOCOLS[swaps[0].chainId][swaps[0].protocol].QUOTER);
  const quoterContract = new Contract(quoter, quoterAbi, provider);

  let Approvals: any = [];
  let Calldatas = [];
  let TokensReturn = [];

  for (let swap of swaps) {
    const agentAddress = await InfraRouterContract?.getAgentAddress(
      swap.address
    );

    const tokenAAddress = swap.reverse ? swap.token1 : swap.token0;
    const tokenBAddress = swap.reverse ? swap.token0 : swap.token1;

    const tokenAContract = new Contract(tokenAAddress, erc20Abi, provider);

    const allowanceAgent = await tokenAContract?.allowance(
      swap.address,
      agentAddress
    );

    const allowanceRouter = await tokenAContract?.allowance(
      swap.address,
      router
    );

    let adjAmount: any = ethers.BigNumber.from(0);

    const tokenADecimals = await tokenAContract.decimals();

    adjAmount = ethers.utils
      .parseUnits(swap.amount.toString(), tokenADecimals)
      .toBigInt();

    if (adjAmount == 0) {
      throw new Error("Invalid Token Decimals");
    }

    if (adjAmount > allowanceAgent) {
      const dataApproveToAgent = tokenAContract.interface.encodeFunctionData(
        "approve",
        [agentAddress, ethers.BigNumber.from(2).pow(256).sub(1)]
      );

      const approvalToAgent: { to: string; value: number; data: string } = {
        to: tokenAAddress,
        value: 0,
        data: dataApproveToAgent,
      };

      Approvals.push(approvalToAgent);
    }

    if (adjAmount > allowanceRouter) {
      const dataApproveToRouter = tokenAContract.interface.encodeFunctionData(
        "approve",
        [router, ethers.BigNumber.from(2).pow(256).sub(1)]
      );

      const approvalToRouter: { to: string; value: number; data: string } = {
        to: tokenAAddress,
        value: 0,
        data: dataApproveToRouter,
      };

      Approvals.push(approvalToRouter);
    }

    const dataTransferFromSenderToAgent =
      tokenAContract.interface.encodeFunctionData("transferFrom", [
        swap.address!,
        agentAddress,
        adjAmount,
      ]);

    const transferFromSenderToAgent = {
      to: tokenAAddress,
      value: 0,
      data: dataTransferFromSenderToAgent,
    };

    Calldatas.push(transferFromSenderToAgent);

    // Check allowance Router to UniRouter
    const allowanceAgentToUniRouter = await tokenAContract?.allowance(
      agentAddress,
      router
    );

    if (allowanceAgentToUniRouter < adjAmount) {
      const calldataApproveAgentToRouter =
        tokenAContract.interface.encodeFunctionData("approve", [
          router,
          adjAmount,
        ]);

      const approvalAgentToRouter = {
        to: tokenAAddress,
        value: 0,
        data: calldataApproveAgentToRouter,
      };

      Calldatas.push(approvalAgentToRouter);
    }

    const quote = await quotePair(
      tokenAAddress,
      tokenBAddress,
      Number(swap.chainId)
    );
    const slippageTolerance = 100;

    if (!quote) {
      console.error("❌ USDC Pool Not Found");
      console.log("↩️ Using WMATIC route");

      const poolFee = await findPoolAndFee(
        quoterContract,
        tokenAAddress,
        NATIVETOKENS[swap.chainId].WRAPPED,
        adjAmount,
        slippageTolerance
      );

      const poolFee2 = await findPoolAndFee(
        quoterContract,
        NATIVETOKENS[swap.chainId].WRAPPED,
        tokenBAddress,
        adjAmount,
        slippageTolerance
      );

      let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60); // 1 hour from now

      // let minimumAmountB = await getAmountOut(
      //   tokenAAddress,
      //   NATIVETOKENS[chainId].WRAPPED,
      //   poolFee,
      //   adjAmount,
      //   quoterContract,
      //   50
      // );

      //  let minimumAmountB2 = await getAmountOut(
      //   NATIVETOKENS[chainId].WRAPPED,
      //   USDC[chainId],
      //   poolFee2,
      //   minimumAmountB,
      //   quoterContract,
      //   50
      // );

      const path = ethers.utils.solidityPack(
        ["address", "uint24", "address", "uint24", "address"],
        [
          tokenAAddress,
          poolFee,
          NATIVETOKENS[swap.chainId].WRAPPED,
          poolFee2,
          tokenBAddress,
        ]
      );

      let swapTxInputs = [path, agentAddress, swapDeadline, adjAmount, 0];

      const calldataSwapAgentToRouter =
        swapRouterContract.interface.encodeFunctionData("exactInput", [
          swapTxInputs,
        ]);

      const swapMultiAgentToRouter = {
        to: PROTOCOLS[swap.chainId][swap.protocol].ROUTER as string,
        value: 0,
        data: calldataSwapAgentToRouter,
      };

      Calldatas.push(swapMultiAgentToRouter);
      TokensReturn.push(tokenBAddress);
    } else {
      const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
      const quoterAddress = quoter;
      const quoterContract = new Contract(quoterAddress, quoterAbi, provider);
      const slippageTolerance = 100;
      const expectedAmountB: BigNumber =
        await quoterContract?.callStatic?.quoteExactInputSingle?.(
          tokenAAddress,
          tokenBAddress,
          3000,
          adjAmount,
          0
        );

      const minimumAmountB = ethers.BigNumber.from(expectedAmountB)
        .mul(10000 - slippageTolerance)
        .div(10000);

      console.log("Minimum Amount B: ", Number(minimumAmountB));

      const poolFee = await findPoolAndFee(
        quoterContract,
        tokenAAddress,
        tokenBAddress,
        adjAmount,
        slippageTolerance
      );

      const swapTxInputs = [
        tokenAAddress,
        tokenBAddress,
        poolFee,
        agentAddress!,
        swapDeadline,
        adjAmount,
        minimumAmountB,
        0,
      ];

      const calldataSwapAgentToRouter =
        swapRouterContract.interface.encodeFunctionData("exactInputSingle", [
          swapTxInputs,
        ]);

      const swapAgentToRouter = {
        to: router as string,
        value: 0,
        data: calldataSwapAgentToRouter,
      };

      Calldatas.push(swapAgentToRouter);
      TokensReturn.push(tokenBAddress);
    }
  }

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}
