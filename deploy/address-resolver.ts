import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { executeIfNewlyDeployment } from '../test-utils/deployment';

const func: DeployFunction = async function ({
  getNamedAccounts,
  deployments,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const deployResult = await deploy('AddressResolver', {
    from: deployer,
  });

  await executeIfNewlyDeployment('AddressResolver', deployResult, async () => {
    const prevProxyController = await deployments.getOrNull('ProxyController');

    // Update AddressResolver implementation address when AddressResolver is update
    // after the second deployment.
    if (prevProxyController) {
      await ethers
        .getContractAt('ProxyController', prevProxyController.address)
        .then(async (contract) =>
          contract.setAddressResolverImpl(deployResult.address),
        )
        .then((tx) => tx.wait());

      console.log(
        'Updated the proxy implementation of AddressResolver at',
        deployResult.address,
      );
    }
  });
};

func.tags = ['AddressResolver'];

export default func;
