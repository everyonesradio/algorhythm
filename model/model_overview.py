"""
Comprehensive guide to building an object detection model using TensorFlow Lite Model Maker

- Gather a diverse dataset of vinyl cover art photos (aim for 40+ images per class)
- Include various angles, lighting conditions, and background variations
- Label your images using Label Studio or a similar tool
- Export annotations in PASCAL VOC or COCO format
- Install tensorflow & tflite-model-maker
- Convert the model to TFLite format
- Test the model in the algoRhythm app
"""

import tensorflow as tflite
from tflite_model_maker import object_detector
from tflite_model_maker.config import ExportFormat

# Load dataset
train_data = object_detector.DataLoader.from_pascal_voc(
  images_dir = 'path/to/tain/images',
  annotations_dir = 'path/to/train/annotations',
  label_map = ['vinyl_cover']
)

validation_data = object_detector.DataLoader.from_pascal_voc(
  images_fir = 'path/to/validation/images',
  annotations_dir = 'path/to/validation/annotations',
  label_maps = ['vinyl_cover']
)

# Create model specification
spec = object_detector.EfficientDetLite0Spec(
  model_name = 'vinyl_detector',
  batch_size = 8,
  epochs = 50,
  learning_rate = 0.1
)

# Train the model
model = object_detector.create(
  train_data = train_data,
  validation_data = validation_data,
  model_spec = spec
)

# Evaluate the model
model.evaluate(validation_data)

# Export the model
model.export(export_dir = 'vinyl_detector', export_format = [ExportFormat.TFLITE, ExportFormat.LABEL])
