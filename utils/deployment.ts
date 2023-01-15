import { DeployResult } from 'hardhat-deploy/types';

const executeIfNewlyDeployment = async (
  name: string,
  deployResult: DeployResult,
  callback?: Function,
) => {
  if (deployResult.newlyDeployed) {
    console.log(`Deployed ${name} at ${deployResult.address}`);

    callback && (await callback());
  } else {
    console.warn(`Skipped deploying ${name}`);
  }
};

export { executeIfNewlyDeployment };
