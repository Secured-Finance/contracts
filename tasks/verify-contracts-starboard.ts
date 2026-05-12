import fs from 'fs';
import { task } from 'hardhat/config';

const externalContracts = [
  'ItayoseCallResolver',
  'OrderBookRotationResolver',
  'Liquidator_Implementation',
  'Liquidator_Proxy',
  'Liquidator',
  'LendingMarketReader',
];

task(
  'verify-contracts-starboard',
  'Verify and register contracts on Starboard',
).setAction(async (_, { run, network }) => {
  const path = `deployments/${network.name}`;

  if (!fs.existsSync(path)) {
    throw new Error(`Deployment directory not found: ${path}`);
  }

  const fileNames = fs
    .readdirSync(path, {
      withFileTypes: true,
    })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.json'))
    .map(({ name }) => name.replace('.json', ''));

  for (const fileName of fileNames) {
    if (externalContracts.includes(fileName) || fileName.includes('Mock')) {
      continue;
    }

    const { address, implementation } = JSON.parse(
      fs.readFileSync(`${path}/${fileName}.json`, 'utf8'),
    );

    console.log(`\nVerifying ${fileName}...`);

    console.log('  address:', address);
    console.log('  implementation:', implementation);

    try {
      await run('starboard-verify', {
        contractName: fileName,
        contractAddress: implementation || address,
      });

      // Verification for the implementation contract succeeded, now verify the proxy if it exists
      console.log(`  ✅ Verification succeeded for ${fileName}!`);

      if (implementation) {
        await run('starboard-verify', {
          contractName: 'UpgradeabilityProxy',
          contractAddress: address,
        });

        console.log(
          `  ✅ Verification succeeded for UpgradeabilityProxy of ${fileName}!`,
        );
      }
    } catch (error: any) {
      if (error.message.includes('contract has been verified')) {
        console.log(`  ℹ️ Already verified`);
      } else {
        console.log('  ❌ Verification failed:', error.message);
        console.error(`Failed to verify ${address}:`, error);
      }
    }
  }
});
