import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { currencies, Currency } from '../utils/currencies';
import { executeIfNewlyDeployment } from '../utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Deploy mock tokens
  const log = {};
  const logHeader = 'Contract Addresses';
  const mockCurrencies: Currency[] = [];
  for (const currency of currencies) {
    if (currency.env) {
      console.log(`${currency.symbol} uses the existing address`);
      log[currency.symbol] = { [logHeader]: currency.env };
      continue;
    }

    const tokenDeployResult = await deploy(currency.mock, {
      from: deployer,
      args: currency.args,
    });
    log[currency.symbol] = { [logHeader]: tokenDeployResult.address };

    await executeIfNewlyDeployment(currency.mock, tokenDeployResult);
    mockCurrencies.push(currency);
  }

  console.table(log);

  // Deploy TokenFaucet
  if (mockCurrencies.length > 0) {
    const faucetDeployResult = await deploy('TokenFaucet', { from: deployer });
    await executeIfNewlyDeployment('TokenFaucet', faucetDeployResult);

    const tokenFaucetContract = await ethers.getContractAt(
      'TokenFaucet',
      faucetDeployResult.address,
    );

    for (const currency of mockCurrencies) {
      const mockToken = await deployments.get(currency.mock);

      if (
        currency.symbol !== 'WETH' &&
        (await tokenFaucetContract.getCurrencyAddress(currency.key)) !==
          mockToken.address
      ) {
        const mockTokenContract = await ethers.getContractAt(
          currency.mock,
          mockToken.address,
        );

        await tokenFaucetContract
          .registerCurrency(
            currency.key,
            mockToken.address,
            ethers.BigNumber.from(currency.args?.[0]).div(100),
          )
          .then((tx) => tx.wait());

        await mockTokenContract
          .setMinterRole(faucetDeployResult.address)
          .then((tx) => tx.wait());
      }
    }
  }
};

func.tags = ['Tokens'];

export default func;
