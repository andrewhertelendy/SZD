from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import gpxpy
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from pydantic import BaseModel

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictionResult(BaseModel):
    estimated_time: float

# Initialize model with basic training data
model = RandomForestRegressor(n_estimators=100)
X = [[100, 5, 500, 300], [200, 8, 800, 500], [150, 6, 600, 400]]  # Sample features
y = [120, 240, 180]  # Sample completion times in minutes
model.fit(X, y)

@app.post("/predict")
async def predict_time(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        # Parse GPX file
        gpx = gpxpy.parse(contents.decode())
        
        # Extract features
        points = []
        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    points.append({'elevation': point.elevation})
        
        df = pd.DataFrame(points)
        elevation_diff = np.diff(df['elevation'].fillna(0))
        elevation_gain = np.sum(elevation_diff[elevation_diff > 0])
        
        # Prepare features for prediction
        features = [[
            elevation_gain,
            gpx.length_3d() / 1000,  # distance in km
            df['elevation'].max(),    # max elevation
            df['elevation'].mean()    # avg elevation
        ]]
        
        prediction = model.predict(features)[0]
        return PredictionResult(estimated_time=prediction)
    
    except Exception as e:
        return {"error": str(e)}