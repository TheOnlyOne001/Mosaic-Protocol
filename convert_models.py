import pickle
from pathlib import Path
from onnxmltools import convert_xgboost
from onnxmltools.utils import save_model
from skl2onnx.common.data_types import FloatTensorType
import onnx

MODELS_DIR = Path(r'C:/Users/shaya/Desktop/Projects/Mosaic Protocol/ml-training/trained/models/ensemble')
N_FEATURES = 68

print('='*60)
print('XGBoost to ONNX Converter')
print('='*60)

for pkl_file in MODELS_DIR.glob('*.pkl'):
    print(f'Converting: {pkl_file.name}')
    
    with open(pkl_file, 'rb') as f:
        model = pickle.load(f)
    
    print(f'  Type: {type(model).__name__}')
    
    initial_types = [('input', FloatTensorType([None, N_FEATURES]))]
    onnx_model = convert_xgboost(model, initial_types=initial_types, target_opset=12)
    onnx.checker.check_model(onnx_model)
    
    onnx_path = pkl_file.with_suffix('.onnx')
    save_model(onnx_model, str(onnx_path))
    print(f'  Saved: {onnx_path.name} ({onnx_path.stat().st_size / 1024:.1f} KB)')

print('='*60)
print('Done!')
