/**
 * Contract addresses and ABIs for Mosaic Protocol payment system
 */

// Chain configuration
export const SUPPORTED_CHAINS = {
  baseSepolia: {
    id: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
  },
  sepolia: {
    id: 11155111,
    name: 'Sepolia',
    rpcUrl: 'https://rpc.sepolia.org',
  },
} as const;

// Contract addresses
export const CONTRACTS = {
  // USDC on Base Sepolia
  USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  // Coordinator wallet that receives payments
  COORDINATOR_WALLET: process.env.NEXT_PUBLIC_COORDINATOR_WALLET || '',
} as const;

// ERC20 ABI (minimal for USDC operations)
export const ERC20_ABI = [
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'transferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Approval',
    type: 'event',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

// USDC has 6 decimals
export const USDC_DECIMALS = 6;

/**
 * Format USDC amount from raw bigint to display string
 */
export function formatUSDC(amount: bigint | string | number): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount);
  const dollars = Number(value) / Math.pow(10, USDC_DECIMALS);
  return `$${dollars.toFixed(2)}`;
}

/**
 * Parse USDC amount from display string to raw bigint
 */
export function parseUSDC(amount: string | number): bigint {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return BigInt(Math.round(value * Math.pow(10, USDC_DECIMALS)));
}

/**
 * Get USDC contract address for a chain
 * Returns undefined for unsupported chains instead of throwing
 */
export function getUSDCAddress(chainId: number): `0x${string}` | undefined {
  // Currently only Base Sepolia is supported
  if (chainId === 84532) {
    return CONTRACTS.USDC as `0x${string}`;
  }
  // Sepolia USDC (Circle's testnet USDC)
  if (chainId === 11155111) {
    return '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`;
  }
  // Unsupported chain - return undefined instead of throwing
  return undefined;
}
