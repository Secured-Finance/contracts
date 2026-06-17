import { BigNumber, Contract } from 'ethers';

/**
 * Generates a Mermaid diagram representation of the OrderStatisticsTree
 * @param ost - The OrderStatisticsTree contract instance
 */
export async function generateMermaidTree(ost: Contract): Promise<BigNumber> {
  let value = await ost.firstValue();
  let totalAmount = BigNumber.from(0);

  if (value.toString() === '0') {
    console.table(['Tree is empty']);
    return totalAmount;
  }

  const treeData: any[] = [];

  while (value.toString() !== '0') {
    const node = await ost.getNode(value);
    treeData.push({
      value: value.toString(),
      parent: node._parent.toString(),
      left: node._left.toString(),
      right: node._right.toString(),
      red: node._red.toString(),
      orderCounter: node._orderCounter.toString(),
      orderTotalAmount: node._orderTotalAmount.toString(),
    });
    value = await ost.nextValue(value);
    totalAmount = totalAmount.add(node._orderTotalAmount.toString());
  }

  // Generate Mermaid code
  console.log('```mermaid');
  console.log('graph TD');

  for (const node of treeData) {
    const nodeId = `N${node.value}`;
    const style =
      node.red === 'true'
        ? 'fill:#ff8888,stroke:#ff0000'
        : 'fill:#333333,stroke:#000000';

    // Define node with value
    console.log(`  ${nodeId}["${node.value}"]`);
    console.log(`  style ${nodeId} ${style}`);

    // Add left child connection
    if (node.left !== '0') {
      const leftId = `N${node.left}`;
      console.log(`  ${nodeId} -->|L| ${leftId}`);
    }

    // Add right child connection
    if (node.right !== '0') {
      const rightId = `N${node.right}`;
      console.log(`  ${nodeId} -->|R| ${rightId}`);
    }
  }

  console.log('```');

  return totalAmount;
}

/**
 * Prints the structure of the OrderStatisticsTree in a tabular format
 * @param ost - The OrderStatisticsTree contract instance
 */
export async function printTreeStructure(ost: Contract): Promise<BigNumber> {
  let value = await ost.firstValue();
  let totalAmount = BigNumber.from(0);

  if (value.toString() === '0') {
    console.table(['Tree is empty']);
    return totalAmount;
  }

  const treeData: any[] = [];

  while (value.toString() !== '0') {
    const node = await ost.getNode(value);
    treeData.push({
      value: value.toString(),
      parent: node._parent.toString(),
      left: node._left.toString(),
      right: node._right.toString(),
      red: node._red.toString(),
      orderCounter: node._orderCounter.toString(),
      orderTotalAmount: node._orderTotalAmount.toString(),
    });
    value = await ost.nextValue(value);
    totalAmount = totalAmount.add(node._orderTotalAmount.toString());
  }

  console.table(treeData);

  return totalAmount;
}

/**
 * Displays the tree structure using either printTreeStructure or generateMermaidTree
 * depending on the TREE_DISPLAY_MODE environment variable.
 * Set TREE_DISPLAY_MODE=mermaid to use Mermaid diagrams, otherwise uses table format.
 * @param ost - The OrderStatisticsTree contract instance
 * @return The total amount of all orders in the tree
 */
export async function displayTree(ost: Contract): Promise<BigNumber> {
  const displayMode = process.env.TREE_DISPLAY_MODE;

  if (displayMode === 'mermaid') {
    return await generateMermaidTree(ost);
  } else {
    return await printTreeStructure(ost);
  }
}

/**
 * Verifies that all paths from root to leaves have the same black node count (Red-Black Tree property)
 * @param ost - The OrderStatisticsTree contract instance
 * @returns true if black heights are consistent, false otherwise
 */
export async function verifyBlackHeightConsistency(
  ost: Contract,
): Promise<boolean> {
  const rootValue = await ost.treeRootNode();

  if (rootValue.toString() === '0') {
    // Empty tree is valid
    return true;
  }

  const rootNode = await ost.getNode(rootValue);

  // Calculate black node count for 4 paths:
  // 1. Root -> Left subtree -> Minimum node
  // 2. Root -> Left subtree -> Maximum node
  // 3. Root -> Right subtree -> Minimum node
  // 4. Root -> Right subtree -> Maximum node

  const counts: number[] = [];

  // Path 1: Left subtree, minimum (leftmost)
  counts.push(
    await countBlackNodesToMinimum(ost, rootNode._left, rootNode._red),
  );

  // Path 2: Left subtree, maximum (rightmost)
  counts.push(
    await countBlackNodesToMaximum(ost, rootNode._left, rootNode._red),
  );

  // Path 3: Right subtree, minimum (leftmost)
  counts.push(
    await countBlackNodesToMinimum(ost, rootNode._right, rootNode._red),
  );

  // Path 4: Right subtree, maximum (rightmost)
  counts.push(
    await countBlackNodesToMaximum(ost, rootNode._right, rootNode._red),
  );

  console.log(`Black node counts: ${counts.join(', ')}`);

  // All counts should be equal
  const firstCount = counts[0];
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] !== firstCount) {
      return false;
    }
  }

  return true;
}

/**
 * Counts black nodes from a starting node to the minimum (leftmost) leaf
 */
async function countBlackNodesToMinimum(
  ost: Contract,
  startValue: any,
  rootIsRed: boolean,
): Promise<number> {
  let count = rootIsRed ? 0 : 1; // Count root if it's black
  let currentValue = startValue;

  while (currentValue.toString() !== '0') {
    const node = await ost.getNode(currentValue);

    // Count current node if it's black
    if (!node._red) {
      count++;
    }

    // Go left to find minimum
    if (node._left.toString() !== '0') {
      currentValue = node._left;
    } else {
      // Reached leftmost node
      break;
    }
  }

  return count;
}

/**
 * Counts black nodes from a starting node to the maximum (rightmost) leaf
 */
async function countBlackNodesToMaximum(
  ost: Contract,
  startValue: any,
  rootIsRed: boolean,
): Promise<number> {
  let count = rootIsRed ? 0 : 1; // Count root if it's black
  let currentValue = startValue;

  while (currentValue.toString() !== '0') {
    const node = await ost.getNode(currentValue);

    // Count current node if it's black
    if (!node._red) {
      count++;
    }

    // Go right to find maximum
    if (node._right.toString() !== '0') {
      currentValue = node._right;
    } else {
      // Reached rightmost node
      break;
    }
  }

  return count;
}

/**
 * Counts the total number of nodes in the tree by traversing from first to last using nextValue
 * @param ost - The OrderStatisticsTree contract instance
 * @returns The total number of nodes in the tree
 */
export async function countTreeNodes(ost: Contract): Promise<number> {
  let value = await ost.firstValue();
  let count = 0;

  if (value.toString() === '0') {
    return 0;
  }

  while (value.toString() !== '0') {
    count++;
    value = await ost.nextValue(value);
  }

  return count;
}
