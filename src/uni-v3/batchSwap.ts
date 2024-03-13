import { BigNumberish, Contract, Wallet, ethers, providers } from "ethers";
import erc20Abi from "../abis/common/ERC20.json";
import swapRouterAbi from "../abis/uniswap/SwapRouter.json";
import routerAbi from "../abis/infra/Router.json";
import quoterAbi from "../abis/uniswap/Quoter.json";
import { PROTOCOLS, NETWORKS, INFRA, NATIVETOKENS, USDC } from "../constants";
import { BigNumber } from "bignumber.js";
import { findPoolAndFee } from "./utils/getPoolFee";
import { quotePair } from "./utils/quote";
import env from "dotenv";
import { parseUnits } from "ethers/lib/utils";

env.config();

function getAdjAmount(_amount: string, _decimals: number) {
  let _adjAmount: ethers.BigNumber;

  if (_decimals == 18) {
    _adjAmount = parseUnits(_amount, 18);
  } else if (_decimals == 6) {
    _adjAmount = parseUnits(_amount, 6);
  } else if (_decimals == 8) {
    _adjAmount = parseUnits(_amount, 8);
  }

  return _adjAmount;
}

export async function buildBatchSwap(
  swaps: Array<{
    wallet: Wallet;
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
  const wallet = swaps[0].wallet;
  const protocol = PROTOCOLS[swaps[0].chainId][swaps[0].protocol];
  const infraRouter = String(INFRA[swaps[0].chainId].ROUTER);
  const InfraRouterContract = new Contract(infraRouter, routerAbi, wallet);
  const uniRouter = String(protocol.ROUTER);
  const swapRouterContract = new Contract(uniRouter, swapRouterAbi, wallet);
  const quoter = String(protocol.QUOTER);
  const quoterContract = new Contract(quoter, quoterAbi, wallet);
  // const gasLimit: Number = 30000000;
  // const gasPrice: BigNumberish = await wallet.provider.getGasPrice();
  // const gas: BigNumberish = gasPrice;

  let Approvals = [];
  let Calldatas = [];
  let TokensReturn = [];

  console.log("::API:: Infra Router Address", infraRouter);
  console.log("::API:: Uni Router Address", uniRouter);

  for (let swap of swaps) {
    const agentAddress = await InfraRouterContract?.getAgentAddress(
      swap.address
    );
    console.log("::API:: Agent Address", agentAddress);
    const tokenAAddress = swap.reverse ? swap.token1 : swap.token0;
    const tokenBAddress = swap.reverse ? swap.token0 : swap.token1;
    const tokenAContract = new Contract(tokenAAddress, erc20Abi, wallet);

    const allowanceAgent = await tokenAContract?.allowance(
      swap.address,
      agentAddress
    );

    const tokenADecimals = await tokenAContract.decimals();
    let adjAmount: any = ethers.BigNumber.from(0);

    console.log("Swap Amount:", String(swap.amount));

    adjAmount = getAdjAmount(swap.amount, tokenADecimals);

    console.log("Adj Amount:", String(adjAmount));

    if (adjAmount == 0) {
      throw new Error("Invalid Token Decimals");
    }

    // Allowance for Agent to Sender
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    if (adjAmount.gt(allowanceAgent)) {
      console.log("::API:: Agent does not have enough allowance");
      const dataApproveToAgent = tokenAContract?.interface.encodeFunctionData(
        "approve",
        [agentAddress, ethers.constants.MaxUint256]
      );

      const approvalToAgent = {
        to: tokenAAddress,
        value: 0,
        data: dataApproveToAgent,
      };

      Approvals.push(approvalToAgent);
    } else {
      console.log("::API:: Agent has enough allowance for Sender");
    }

    // Check allowance Router to UniRouter
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const allowanceAgentToUniRouter = await tokenAContract?.allowance(
      agentAddress,
      uniRouter
    );

    if (adjAmount.gt(allowanceAgentToUniRouter)) {
      console.log(
        "::API:: Agent does not have enough allowance for Uni Router"
      );

      const calldataApproveAgentToRouter =
        tokenAContract.interface.encodeFunctionData("approve", [
          uniRouter,
          ethers.constants.MaxUint256,
        ]);

      const approvalAgentToRouter = {
        to: tokenAAddress,
        value: 0,
        data: calldataApproveAgentToRouter,
      };

      Calldatas.push(approvalAgentToRouter);
    } else {
      console.log("::API:: Agent has enough allowance for Uni Router");
    }

    // Transfer tokens from Sender to Agent
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const dataTransferFromSenderToAgent =
      tokenAContract.interface.encodeFunctionData("transferFrom", [
        swap.address,
        agentAddress,
        adjAmount,
      ]);

    const transferFromSenderToAgent = {
      to: tokenAAddress,
      value: 0,
      data: dataTransferFromSenderToAgent,
    };

    Calldatas.push(transferFromSenderToAgent);

    // Encode Swap tx to Uni Router
    // ----------------------------------------------------------------------------
    // ----------------------------------------------------------------------------

    const quote = await quotePair(
      tokenAAddress,
      tokenBAddress,
      Number(swap.chainId)
    );

    const slippageTolerance = swap.slippage;

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

      const expectedAmountB: BigNumber =
        await quoterContract?.callStatic?.quoteExactInputSingle?.(
          tokenAAddress,
          NATIVETOKENS[swap.chainId].WRAPPED,
          poolFee,
          adjAmount,
          0
        );

      const poolFee2 = await findPoolAndFee(
        quoterContract,
        NATIVETOKENS[swap.chainId].WRAPPED,
        tokenBAddress,
        expectedAmountB as any, // Convert expectedAmountB to BigNumber
        slippageTolerance
      );

      let swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60); // 1 hour from now

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
        to: uniRouter,
        value: 0,
        data: calldataSwapAgentToRouter,
      };

      Calldatas.push(swapMultiAgentToRouter);
      TokensReturn.push(tokenBAddress);
    } else {
      const swapDeadline = Math.floor(Date.now() / 1000 + 60 * 60);
      const quoterAddress = quoter;
      const quoterContract = new Contract(quoterAddress, quoterAbi, provider);
      const slippageTolerance = swap.slippage;

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
        to: uniRouter,
        value: 0,
        data: calldataSwapAgentToRouter,
      };

      Calldatas.push(swapAgentToRouter);
      TokensReturn.push(tokenBAddress);
    }
  }

  console.log("::API:: Approvals", Approvals);
  console.log("::API:: Calldatas", Calldatas);
  console.log("::API:: TokensReturn", TokensReturn);

  return {
    Approvals,
    Calldatas,
    TokensReturn,
  };
}
