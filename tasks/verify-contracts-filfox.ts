import axios from 'axios';
import fs from 'fs';
import { task } from 'hardhat/config';
import { Artifacts } from 'hardhat/types';

const API_URL = 'https://filfox.info/api/v1/tools/verifyContract';

const externalContracts = [
  'ItayoseCallResolver',
  'OrderBookRotationResolver',
  'Liquidator_Implementation',
  'Liquidator_Proxy',
  'Liquidator',
  'LendingMarketReader',
];

const getLibrarySettings = async (
  contractName: string,
  deploymentLibraries: Record<string, string>,
  artifacts: Artifacts,
) => {
  if (Object.keys(deploymentLibraries).length === 0) {
    return {};
  }

  const artifact = await artifacts.readArtifact(contractName);
  const unresolvedLibraries = new Set(Object.keys(deploymentLibraries));

  const libraries = Object.entries(artifact.linkReferences).reduce<
    Record<string, Record<string, string>>
  >((result, [sourceName, references]) => {
    const sourceLibraries = Object.keys(references).reduce<
      Record<string, string>
    >((linkedLibraries, libraryName) => {
      const address = deploymentLibraries[libraryName];

      if (address) {
        linkedLibraries[libraryName] = address;
        unresolvedLibraries.delete(libraryName);
      }

      return linkedLibraries;
    }, {});

    if (Object.keys(sourceLibraries).length > 0) {
      result[sourceName] = sourceLibraries;
    }

    return result;
  }, {});

  if (unresolvedLibraries.size > 0) {
    throw new Error(
      `Library link references not found for ${contractName}: ${Array.from(
        unresolvedLibraries,
      ).join(', ')}`,
    );
  }

  return libraries;
};

interface VerifyContractParams {
  address: string;
  language: string;
  compiler: string;
  optimize: boolean;
  optimizeRuns: number;
  optimizerDetails: string;
  sourceFiles: Record<string, any>;
  license: string;
  evmVersion: string;
  viaIR: boolean;
  libraries: string;
  metadata: string;
}

const verifyContract = async (
  targetAddress: string,
  params: Omit<VerifyContractParams, 'address'>,
  addressLabel: string,
) => {
  const opts = {
    headers: { 'Content-Type': 'application/json' },
    timeout: 180000, // 3 minutes timeout
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  };

  const body: VerifyContractParams = {
    address: targetAddress,
    ...params,
  };

  const res = await axios.post(API_URL, body, opts);

  if (res.data.success) {
    console.log(`✅ Verified ${addressLabel}`);
  } else {
    if (res.data.errorCode === 6) {
      console.log(`  ℹ️  Already verified ${addressLabel}`);
    } else {
      console.log(`  ❌ Verification failed ${addressLabel}`);
      console.log('  errorCode:', res.data.errorCode);
      console.log('  contractName:', res.data.contractName);

      if (res.data.errorCode === 4) {
        console.log(
          '  Note: errorCode 4 means compiled bytecode does not match contract initcode',
        );
      }
    }
  }
};

task(
  'verify-contracts-filfox',
  'Verify and register contracts on Filfox',
).setAction(async (_, { artifacts, deployments, network }) => {
  const fileNames = fs
    .readdirSync(`deployments/${network.name}`, {
      withFileTypes: true,
    })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.json'))
    .map(({ name }) => name.replace('.json', ''));

  for (const fileName of fileNames) {
    if (externalContracts.includes(fileName) || fileName.includes('Mock')) {
      continue;
    }

    const deployment = await deployments.get(fileName);
    const {
      address,
      implementation,
      metadata,
      solcInputHash,
      libraries: deploymentLibraries = {},
    } = deployment;

    const parsedMetadata = metadata ? JSON.parse(metadata) : {};

    // Read solcInput for accurate compiler settings
    const solcInputPath = `deployments/${network.name}/solcInputs/${solcInputHash}.json`;
    const solcInput = JSON.parse(fs.readFileSync(solcInputPath, 'utf8'));

    // Get the actual contract file and name from compilationTarget
    const compilationTarget = parsedMetadata.settings?.compilationTarget ?? {};
    const contractFile = Object.keys(compilationTarget)[0];

    console.log(`\nVerifying ${fileName}...`);
    console.log('  address:', address);
    console.log('  implementation:', implementation);

    // Use sources from metadata (not solcInput) to reduce payload size
    // metadata.sources contains only the files actually used in compilation
    let sourceFiles = Object.keys(parsedMetadata.sources).reduce((acc, key) => {
      // Get content from solcInput since metadata doesn't have it
      acc[key] = solcInput.sources[key];
      return acc;
    }, {});

    // Move the main contract file to the front
    if (contractFile && sourceFiles[contractFile]) {
      const contractSource = sourceFiles[contractFile];
      delete sourceFiles[contractFile];
      sourceFiles = { [contractFile]: contractSource, ...sourceFiles };
    } else {
      console.log('⚠️ Warning: contractFile not found in sourceFiles');
      console.log('  contractFile:', contractFile);
      console.log('  available files:', Object.keys(sourceFiles).slice(0, 5));
    }

    // Get evmVersion from metadata settings, fallback to solcInput or 'default'
    const evmVersion =
      parsedMetadata.settings?.evmVersion ??
      solcInput.settings.evmVersion ??
      'default';

    const libraries = await getLibrarySettings(
      fileName,
      deploymentLibraries,
      artifacts,
    );
    const metadataSettings =
      parsedMetadata.settings?.metadata ?? solcInput.settings?.metadata ?? {};
    const optimizerDetails = solcInput.settings.optimizer.details;

    const verifyParams = {
      language: parsedMetadata.language,
      compiler: `v${parsedMetadata.compiler.version}`,
      optimize: solcInput.settings.optimizer.enabled,
      optimizeRuns: solcInput.settings.optimizer.runs,
      optimizerDetails: optimizerDetails
        ? JSON.stringify(optimizerDetails)
        : '',
      sourceFiles,
      license: 'Business Source License (BSL 1.1)',
      evmVersion,
      viaIR:
        parsedMetadata.settings?.viaIR ?? solcInput.settings?.viaIR ?? false,
      libraries:
        Object.keys(libraries).length > 0 ? JSON.stringify(libraries) : '',
      metadata:
        Object.keys(metadataSettings).length > 0
          ? JSON.stringify(metadataSettings)
          : '',
    };

    // If implementation exists, verify both proxy and implementation
    if (implementation) {
      await verifyContract(address, verifyParams, 'proxy');
      await verifyContract(implementation, verifyParams, 'implementation');
    } else {
      await verifyContract(address, verifyParams, 'contract');
    }
  }
});
