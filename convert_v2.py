import pickle
import warnings
from pathlib import Path
import numpy as np

# Suppress XGBoost version warnings
warnings.filterwarnings('ignore')

try:
    from onnxmltools import convert_xgboost
    from onnxmltools.utils import save_model
    from skl2onnx.common.data_types import FloatTensorType
    import onnx
except ImportError as e:
    print(f'Missing: {e}')
    exit(1)

MODELS_DIR = Path(r'C:/Users/shaya/Desktop/Projects/Mosaic Protocol/ml-training/trained/models/ensemble')
N_FEATURES = 68

print('Converting XGBoost models to ONNX...')

for pkl_file in MODELS_DIR.glob('*.pkl'):
    print(f'\n{pkl_file.name}:')
    
    with open(pkl_file, 'rb') as f:
        model = pickle.load(f)
    
    print(f'  Loaded {type(model).__name__} with {getattr(model, \"n_features_in_\", \"?\")} features')
    
    # Define input type
    initial_types = [('float_input', FloatTensorType([None, N_FEATURES]))]
    
    try:
        # Convert with explicit opset
        onnx_model = convert_xgboost(
            model,
            name='xgboost_classifier',
            initial_types=initial_types,
            target_opset={'': 12, 'ai.onnx.ml': 2}
        )
        
        # Validate
        onnx.checker.check_model(onnx_model)
        
        # Save
        onnx_path = pkl_file.with_suffix('.onnx')
        save_model(onnx_model, str(onnx_path))
        print(f'  Saved: {onnx_path.name} ({onnx_path.stat().st_size / 1024:.1f} KB)')
        
    except Exception as e:
        print(f'  ERROR: {e}')

print('\nDone!')
