'use client';

import React from 'react';
import QuantumNeuralNetwork from '../quantum-network/QuantumNeuralNetwork';

interface QuantumNeuralBackgroundProps {
    workflowStage?: string;
}

/**
 * Quantum Neural Background - Wrapper component for the 3D neural network visualization
 * Used as a background element in the dashboard
 */
export default function QuantumNeuralBackground({ workflowStage }: QuantumNeuralBackgroundProps) {
    return (
        <div className="fixed inset-0 -z-10 pointer-events-none">
            <QuantumNeuralNetwork />
        </div>
    );
}
