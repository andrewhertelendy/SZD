from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import gpxpy
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from pydantic import BaseModel
import logging
from typing import List, Dict
from datetime import datetime
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictionResult(BaseModel):
    estimated_time: float

def calculate_segment_features(points_df):
    """Calculate features for a segment of the hike"""
    # First calculate base features (available for both training and prediction)
    base_features = {}
    
    # Distance and elevation features
    points_df['elevation_diff'] = points_df['elevation'].diff()
    points_df['gradient'] = np.where(
        points_df['distance_diff'] > 0,
        points_df['elevation_diff'] / points_df['distance_diff'],
        0
    )
    
    # Calculate moving averages for smoothing
    window_size = 5
    points_df['elevation_ma'] = points_df['elevation'].rolling(window=window_size, min_periods=1).mean()
    points_df['gradient_ma'] = points_df['gradient'].rolling(window=window_size, min_periods=1).mean()
    
    base_features.update({
        'total_distance': points_df['distance_diff'].sum(),
        'total_elevation_gain': points_df['elevation_diff'][points_df['elevation_diff'] > 0].sum(),
        'total_elevation_loss': abs(points_df['elevation_diff'][points_df['elevation_diff'] < 0].sum()),
        'avg_gradient': points_df['gradient'].mean(),
        'max_gradient': points_df['gradient'].max(),
        'min_gradient': points_df['gradient'].min(),
        'gradient_std': points_df['gradient'].std(),
        'max_elevation': points_df['elevation'].max(),
        'min_elevation': points_df['elevation'].min(),
        'elevation_range': points_df['elevation'].max() - points_df['elevation'].min(),
        'num_points': len(points_df)
    })
    
    return base_features

class HikingModel:
    def __init__(self):
        self.data = []
        self.model = RandomForestRegressor(n_estimators=100)
        self.is_trained = False
        self.feature_names = None
        
    def extract_features(self, gpx_content):
        gpx = gpxpy.parse(gpx_content)
        all_points = []
        
        for track in gpx.tracks:
            for segment in track.segments:
                points_data = []
                prev_point = None
                
                for point in segment.points:
                    point_data = {
                        'latitude': point.latitude,
                        'longitude': point.longitude,
                        'elevation': point.elevation,
                    }
                    
                    # Calculate distance from previous point
                    if prev_point:
                        distance = point.distance_3d(prev_point)
                    else:
                        distance = 0
                    point_data['distance_diff'] = distance
                    
                    if point.time:
                        point_data['time'] = point.time
                    
                    points_data.append(point_data)
                    prev_point = point
                
                all_points.extend(points_data)
        
        df = pd.DataFrame(all_points)
        features = calculate_segment_features(df)
        
        # Extract completion time if available
        completion_time = None
        if 'time' in df.columns:
            time_diff = pd.to_datetime(df['time'].max()) - pd.to_datetime(df['time'].min())
            completion_time = time_diff.total_seconds() / 60
        
        return features, completion_time
    
    def add_training_data(self, name: str, gpx_content: str):
        features, completion_time = self.extract_features(gpx_content)
        
        if completion_time is None:
            raise ValueError("Training data must include timestamps")
        
        training_entry = {
            "id": str(uuid.uuid4()),
            "name": name,
            "features": features,
            "completion_time": completion_time
        }
        
        self.data.append(training_entry)
        self.train_model()
        return training_entry
    
    def remove_training_data(self, id: str):
        self.data = [d for d in self.data if d["id"] != id]
        if self.data:
            self.train_model()
        else:
            self.is_trained = False
            self.feature_names = None
    
    def train_model(self):
        if len(self.data) < 1:
            return
        
        # Use only the features that are available in all entries
        self.feature_names = list(self.data[0]["features"].keys())
        X = [[d["features"][f] for f in self.feature_names] for d in self.data]
        y = [d["completion_time"] for d in self.data]
        
        self.model.fit(X, y)
        self.is_trained = True
    
    def predict(self, gpx_content: str):
        if not self.is_trained:
            raise ValueError("Model needs training data first")
        
        features, _ = self.extract_features(gpx_content)
        
        # Ensure we use the same features as in training
        X = [[features[f] for f in self.feature_names]]
        
        return self.model.predict(X)[0]
    
    def get_all_data(self):
        return self.data

model = HikingModel()

@app.post("/train")
async def add_training_data(file: UploadFile = File(...)):
    logger.info(f"Adding training data: {file.filename}")
    contents = await file.read()
    try:
        training_entry = model.add_training_data(file.filename, contents.decode())
        return {"message": "Training data added successfully", "data": training_entry}
    except Exception as e:
        logger.error(f"Error processing training file: {str(e)}")
        return {"error": str(e)}

@app.delete("/training-data/{id}")
async def delete_training_data(id: str):
    try:
        model.remove_training_data(id)
        return {"message": f"Training data {id} deleted successfully"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/training-data")
async def get_training_data():
    return model.get_all_data()

@app.post("/predict")
async def predict_time(file: UploadFile = File(...)):
    if not model.is_trained:
        return {"error": "Model needs training data first"}
    
    logger.info(f"Predicting for file: {file.filename}")
    contents = await file.read()
    try:
        prediction = model.predict(contents.decode())
        logger.info(f"Prediction result: {prediction} minutes")
        
        return PredictionResult(estimated_time=prediction)
    except Exception as e:
        logger.error(f"Error processing file: {str(e)}")
        return {"error": str(e)}