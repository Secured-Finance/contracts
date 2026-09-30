import { BigNumber, Contract, Signer } from 'ethers';
import { existsSync, readFileSync } from 'fs';
import { task, types } from 'hardhat/config';
import { HardhatPluginError } from 'hardhat/internal/core/errors';
import { resolve } from 'path';

import { Proposal } from '../utils/deployment';
import { toBytes32 } from '../utils/strings';

interface CorrectionSourceInput {
  transactionHash: string;
  blockNumber: string;
  offsetAmount: string;
}

interface TotalSupplyCorrectionInput {
  maturity: string;
  correctionAmount: string;
  sources: CorrectionSourceInput[];
}

interface RecoveryData {
  version: 1;
  network: string;
  chainId: string;
  currency: string;
  corrections: TotalSupplyCorrectionInput[];
}

const PLUGIN_NAME = 'SecuredFinance';

const fail = (message: string): never => {
  throw new HardhatPluginError(PLUGIN_NAME, message);
};

const readRecoveryData = (
  root: string,
  network: string,
  currency: string,
): RecoveryData => {
  if (!/^[A-Z][A-Z0-9]*$/.test(currency)) {
    fail(`Invalid recovery currency: ${currency}`);
  }

  const path = resolve(
    root,
    'recovery-data',
    network,
    `${currency.toLowerCase()}.json`,
  );
  if (!existsSync(path)) fail(`Recovery data does not exist: ${path}`);

  const data = JSON.parse(readFileSync(path, 'utf8')) as RecoveryData;
  if (data.version !== 1) fail('Unsupported recovery data version');
  if (data.network !== network) {
    fail(`Recovery data network ${data.network} does not match ${network}`);
  }
  if (data.currency !== currency) {
    fail(`Recovery data currency ${data.currency} does not match ${currency}`);
  }
  if (!Array.isArray(data.corrections) || data.corrections.length === 0) {
    fail('Recovery data must contain at least one correction');
  }

  return data;
};

const validateCorrections = (
  ethers: any,
  corrections: TotalSupplyCorrectionInput[],
) => {
  const maturities = new Set<string>();

  for (const correction of corrections) {
    const maturity = BigNumber.from(correction.maturity);
    const correctionAmount = BigNumber.from(correction.correctionAmount);
    const maturityKey = maturity.toString();

    if (maturity.isNegative()) fail(`Invalid maturity: ${maturityKey}`);
    if (maturities.has(maturityKey)) {
      fail(`Duplicate correction maturity: ${maturityKey}`);
    }
    maturities.add(maturityKey);

    if (correctionAmount.lte(0)) {
      fail(`Invalid correction amount for maturity ${maturityKey}`);
    }
    if (!Array.isArray(correction.sources) || correction.sources.length === 0) {
      fail(`Correction for maturity ${maturityKey} must contain sources`);
    }

    const sourceTotal = correction.sources.reduce((total, source) => {
      if (!ethers.utils.isHexString(source.transactionHash, 32)) {
        fail(`Invalid source transaction hash: ${source.transactionHash}`);
      }

      const blockNumber = BigNumber.from(source.blockNumber);
      const offsetAmount = BigNumber.from(source.offsetAmount);
      if (blockNumber.lte(0) || offsetAmount.lte(0)) {
        fail(`Invalid source values for ${source.transactionHash}`);
      }
      return total.add(offsetAmount);
    }, BigNumber.from(0));

    if (!sourceTotal.eq(correctionAmount)) {
      fail(
        `Source total mismatch for maturity ${maturityKey}: expected ${correctionAmount.toString()}, found ${sourceTotal.toString()}`,
      );
    }
  }
};

const getExecutionSigner = async (
  ethers: any,
  deployer: Signer,
  owner: string,
): Promise<Signer> => {
  if (process.env.FORK_RPC_ENDPOINT) return ethers.provider.getSigner(owner);
  return deployer;
};

task(
  'recover-vault-total-supplies',
  'Correct inflated FV and GV total supplies from reviewed recovery data',
)
  .addParam('currency', 'Recovery currency symbol', undefined, types.string)
  .setAction(
    async (
      { currency: currencyInput },
      { config, deployments, ethers, getChainId, network },
    ) => {
      const currency = currencyInput.toUpperCase();
      const data = readRecoveryData(config.paths.root, network.name, currency);
      const chainId = await getChainId();
      if (data.chainId !== chainId) {
        fail(
          `Recovery data chainId ${data.chainId} does not match connected chain ${chainId}`,
        );
      }
      validateCorrections(ethers, data.corrections);

      const [deployer] = await ethers.getSigners();
      if (!deployer) fail('No transaction signer is available');

      const proxyController = await deployments
        .get('ProxyController')
        .then(({ address }) =>
          ethers.getContractAt('ProxyController', address),
        );
      const [controllerAddress, genesisValueVaultAddress] = await Promise.all([
        proxyController.getAddress(toBytes32('LendingMarketController')),
        proxyController.getAddress(toBytes32('GenesisValueVault')),
      ]);
      const controller = await ethers.getContractAt(
        'LendingMarketController',
        controllerAddress,
      );
      const genesisValueVault = await ethers.getContractAt(
        'GenesisValueVault',
        genesisValueVaultAddress,
      );
      const ccy = toBytes32(currency);
      const futureValueVault = await controller
        .getFutureValueVault(ccy)
        .then((address: string) =>
          ethers.getContractAt('FutureValueVault', address),
        );

      const calls: string[] = [];
      const rows: Record<string, string>[] = [];
      for (const correction of data.corrections) {
        const maturity = BigNumber.from(correction.maturity);
        const correctionAmount = BigNumber.from(correction.correctionAmount);
        let vault: Contract;
        let lendingSupply: BigNumber;
        let borrowingSupply: BigNumber;

        if (maturity.isZero()) {
          vault = genesisValueVault;
          [lendingSupply, borrowingSupply] = await Promise.all([
            vault.getTotalLendingSupply(ccy),
            vault.getTotalBorrowingSupply(ccy),
          ]);
        } else {
          if (!(await controller.isValidMaturity(ccy, maturity))) {
            fail(`Invalid recovery maturity: ${maturity.toString()}`);
          }
          vault = futureValueVault;
          [lendingSupply, borrowingSupply] = await Promise.all([
            vault.getTotalLendingSupply(maturity),
            vault.getTotalBorrowingSupply(maturity),
          ]);
        }

        if (
          correctionAmount.gt(lendingSupply) ||
          correctionAmount.gt(borrowingSupply)
        ) {
          fail(
            `Correction ${correctionAmount.toString()} exceeds a stored total for maturity ${maturity.toString()}`,
          );
        }

        rows.push({
          vault: maturity.isZero() ? 'GenesisValueVault' : 'FutureValueVault',
          maturity: maturity.isZero() ? '-' : maturity.toString(),
          correctionAmount: correctionAmount.toString(),
          lendingSupplyBefore: lendingSupply.toString(),
          lendingSupplyAfter: lendingSupply.sub(correctionAmount).toString(),
          borrowingSupplyBefore: borrowingSupply.toString(),
          borrowingSupplyAfter: borrowingSupply
            .sub(correctionAmount)
            .toString(),
        });
        calls.push(
          controller.interface.encodeFunctionData('correctTotalSupply', [
            ccy,
            maturity,
            correctionAmount,
          ]),
        );
      }

      const owner = await controller.owner();
      const multicallData = controller.interface.encodeFunctionData(
        'multicall',
        [calls],
      );

      // Simulate as the Controller owner so every correction is checked as one
      // atomic operation before it is executed or proposed.
      await ethers.provider.call({
        from: owner,
        to: controller.address,
        data: multicallData,
      });

      console.table(rows);

      if (process.env.ENABLE_AUTO_UPDATE === 'true') {
        const signer = await getExecutionSigner(ethers, deployer, owner);
        const signerAddress = await signer.getAddress();
        if (
          ethers.utils.getAddress(signerAddress) !==
          ethers.utils.getAddress(owner)
        ) {
          fail(
            `Execution signer ${signerAddress} is not the Controller owner ${owner}`,
          );
        }

        await signer
          .sendTransaction({ to: controller.address, data: multicallData })
          .then((transactionResponse) => transactionResponse.wait());
        console.log(
          `Successfully corrected ${rows.length} vault total supplies`,
        );
        return;
      }

      const deployerAddress = await deployer.getAddress();
      const proposalOwner = String(process.env.SAFE_WALLET_ADDRESS);
      if (!proposalOwner || !ethers.utils.isAddress(proposalOwner)) {
        fail('The proposal wallet EVM address is not configured');
      }
      if (
        ethers.utils.getAddress(proposalOwner) !==
        ethers.utils.getAddress(owner)
      ) {
        fail(
          `Proposal wallet ${proposalOwner} is not the Controller owner ${owner}`,
        );
      }

      const proposal = await Proposal.create(network.provider, deployerAddress);
      await proposal.add(controller.address, multicallData);
      await proposal.submit();
    },
  );
