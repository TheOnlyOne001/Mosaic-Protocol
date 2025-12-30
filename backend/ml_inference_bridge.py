"""
XGBoost Inference Bridge for Node.js
Reads features from stdin JSON, outputs prediction JSON to stdout
"""
import pickle
import sys
import json
import warnings
from pathlib import Path
import numpy as np

warnings.filterwarnings('ignore')

MODELS_DIR = Path(r'C:/Users/shaya/Desktop/Projects/Mosaic Protocol/ml-training/trained/models/ensemble')

def load_models():
    """Load both ensemble models"""
    models = {}
    
    recall_path = MODELS_DIR / 'ensemble_recall_model.pkl'
    with open(recall_path, 'rb') as f:
        models['recall'] = pickle.load(f)
    
    precision_path = MODELS_DIR / 'ensemble_precision_model.pkl'
    with open(precision_path, 'rb') as f:
        models['precision'] = pickle.load(f)
    
    return models

def classify_severity(probability):
    """Classify probability into severity tier"""
    if probability >= 0.50:
        return 'CRITICAL', 'High confidence exploit detected. Immediate review required.'
    elif probability >= 0.15:
        return 'HIGH', 'Suspicious patterns found. Manual review recommended.'
    elif probability >= 0.007:
        return 'LOW', 'Minor risk or code complexity warning.'
    else:
        return 'SAFE', 'No significant issues detected.'

def predict(models, features):
    """Run ensemble prediction with severity tiers"""
    # Convert features to numpy array
    X = np.array(features).reshape(1, -1)
    
    # Get probability predictions
    recall_proba = models['recall'].predict_proba(X)[0][1]  # P(vulnerable)
    precision_proba = models['precision'].predict_proba(X)[0][1]
    
    # Weighted ensemble
    probability = 0.7 * recall_proba + 0.3 * precision_proba
    
    # Classify severity
    severity, severity_message = classify_severity(probability)
    
    return {
        'probability': float(probability),
        'recall_score': float(recall_proba),
        'precision_score': float(precision_proba),
        'is_vulnerable': bool(probability >= 0.007),
        'severity': severity,
        'severity_message': severity_message,
        'threshold': 0.007
    }

def main():
    """Main inference loop - read JSON from stdin, output prediction"""
    try:
        models = load_models()
        print(json.dumps({'status': 'ready', 'models': 2}), flush=True)
        
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            
            try:
                data = json.loads(line)
                features = data.get('features', [])
                
                if len(features) != 68:
                    print(json.dumps({'error': f'Expected 68 features, got {len(features)}'}), flush=True)
                    continue
                
                result = predict(models, features)
                print(json.dumps(result), flush=True)
                
            except json.JSONDecodeError as e:
                print(json.dumps({'error': f'Invalid JSON: {e}'}), flush=True)
            except Exception as e:
                print(json.dumps({'error': str(e)}), flush=True)
                
    except Exception as e:
        print(json.dumps({'error': f'Failed to load models: {e}'}), flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
