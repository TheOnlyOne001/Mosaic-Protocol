"""
XGBoost to ONNX Converter
Uses Int64TensorType as required by XGBoost converter
"""
import pickle
import warnings
from pathlib import Path
import numpy as np

warnings.filterwarnings('ignore')

import xgboost as xgb
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType, Int64TensorType
from onnxmltools.convert.xgboost.operator_converters.XGBoost import convert_xgboost
from onnxmltools.convert.xgboost.shape_calculators.Classifier import calculate_xgboost_classifier_output_shapes
from skl2onnx import update_registered_converter
import onnx

MODELS_DIR = Path(r'C:/Users/shaya/Desktop/Projects/Mosaic Protocol/ml-training/trained/models/ensemble')
N_FEATURES = 68

print('='*60)
print('XGBoost to ONNX Converter')
print('='*60)

# Register XGBoost converter
update_registered_converter(
    xgb.XGBClassifier, 
    'XGBoostXGBClassifier',
    calculate_xgboost_classifier_output_shapes,
    convert_xgboost,
    options={'nocl': [True, False], 'zipmap': [False, True]}
)
print('Registered XGBClassifier converter')

for pkl_file in MODELS_DIR.glob('*.pkl'):
    print(f'\n{pkl_file.name}:')
    
    with open(pkl_file, 'rb') as f:
        model = pickle.load(f)
    
    n_feat = getattr(model, 'n_features_in_', 'unknown')
    print(f'  Loaded {type(model).__name__} with {n_feat} features')
    
    # Try Int64TensorType as required
    initial_types = [('int_input', Int64TensorType([None, N_FEATURES]))]
    
    try:
        onnx_model = convert_sklearn(
            model,
            initial_types=initial_types,
            target_opset={'': 12, 'ai.onnx.ml': 2},
            options={'zipmap': False}
        )
        
        onnx.checker.check_model(onnx_model)
        
        onnx_path = pkl_file.with_suffix('.onnx')
        with open(onnx_path, 'wb') as f:
            f.write(onnx_model.SerializeToString())
        
        size_kb = onnx_path.stat().st_size / 1024
        print(f'  SUCCESS! Saved: {onnx_path.name} ({size_kb:.1f} KB)')
        
    except Exception as e:
        print(f'  ERROR: {e}')

print('\n' + '='*60)
print('Output files:')
for f in MODELS_DIR.glob('*.onnx'):
    print(f'  {f.name}: {f.stat().st_size / 1024:.1f} KB')
print('='*60)
