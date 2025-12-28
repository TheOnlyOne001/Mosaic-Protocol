'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance } from 'wagmi';
import { Wallet, ChevronDown } from 'lucide-react';
import { formatUnits } from 'viem';
import { CONTRACTS, USDC_DECIMALS, getUSDCAddress } from '@/lib/contracts';
import { useReadContract } from 'wagmi';
import { ERC20_ABI } from '@/lib/contracts';

/**
 * Custom Connect Wallet Button that matches Mosaic Protocol styling
 */
export function ConnectWalletButton() {
  const { address, isConnected, chainId } = useAccount();

  // Get USDC balance
  const usdcAddress = chainId ? getUSDCAddress(chainId) : undefined;
  const { data: usdcBalance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!usdcAddress,
    },
  });

  const formattedUSDC = usdcBalance
    ? `$${parseFloat(formatUnits(usdcBalance, USDC_DECIMALS)).toFixed(2)}`
    : '$0.00';

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="flex items-center gap-2 px-4 py-2 text-white rounded-xl transition-all font-medium hover-lift"
                    style={{
                      background: 'linear-gradient(135deg, rgba(168,85,247,0.9) 0%, rgba(139,92,246,0.9) 100%)',
                      boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
                    }}
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-2 px-4 py-2 text-white rounded-xl transition-all font-medium"
                    style={{
                      background: 'rgba(251,191,36,0.2)',
                      border: '1px solid rgba(251,191,36,0.3)',
                    }}
                  >
                    Wrong Network
                    <ChevronDown className="w-4 h-4" />
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  {/* USDC Balance */}
                  <div
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span className="text-white/50 text-sm">USDC:</span>
                    <span className="text-cyan-400 font-medium text-sm">{formattedUSDC}</span>
                  </div>

                  {/* Chain selector */}
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all hover-lift"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          overflow: 'hidden',
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 20, height: 20 }}
                          />
                        )}
                      </div>
                    )}
                    <span className="hidden sm:inline text-sm text-white/70">{chain.name}</span>
                    <ChevronDown className="w-3 h-3 text-white/40" />
                  </button>

                  {/* Account button */}
                  <button
                    onClick={openAccountModal}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover-lift"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="w-5 h-5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                    <span className="text-sm text-white font-medium">
                      {account.displayName}
                    </span>
                    <ChevronDown className="w-3 h-3 text-white/40" />
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

export default ConnectWalletButton;
