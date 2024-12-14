import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, ActivityIndicator, ScrollView, Platform, TouchableOpacity } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

const API_BASE_URL = 'http://192.168.8.102:8000';

export default function App() {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [trainingData, setTrainingData] = useState([]); // Initialize as empty array
  const [debugInfo, setDebugInfo] = useState([]);

  useEffect(() => {
    fetchTrainingData(); // Fetch training data when component mounts
  }, []);

  const fetchTrainingData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/training-data`);
      if (!response.ok) {
        throw new Error('Failed to fetch training data');
      }
      const data = await response.json();
      setTrainingData(data || []); // Ensure we always set an array
    } catch (err) {
      setError(`Error fetching training data: ${err.message}`);
      setTrainingData([]); // Reset to empty array on error
    }
  };

  const deleteTrainingData = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/training-data/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete training data');
      }
      await fetchTrainingData(); // Refresh the list after deletion
    } catch (err) {
      setError(`Error deleting training data: ${err.message}`);
    }
  };

  const pickDocument = async (isTraining) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        presentationStyle: 'fullScreen',
        copyToCacheDirectory: true,
        type: ['application/gpx+xml', 'text/xml', '*/*']
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (isTraining) {
          await uploadTrainingFile(asset);
        } else {
          await predictTime(asset);
        }
      }
    } catch (err) {
      setError(`Error picking file: ${err.message}`);
    }
  };

  const uploadTrainingFile = async (asset) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: 'application/gpx+xml',
        name: asset.name
      });

      const response = await fetch(`${API_BASE_URL}/train`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to upload training file');
      }

      await fetchTrainingData(); // Refresh the list after adding new data
    } catch (err) {
      setError(`Error uploading training file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const predictTime = async (asset) => {
    setLoading(true);
    setError(null);
    setPrediction(null);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: 'application/gpx+xml',
        name: asset.name
      });

      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get prediction');
      }

      const data = await response.json();
      setPrediction(data.estimated_time);
    } catch (err) {
      setError(`Error predicting time: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <Text style={styles.title}>Hike Time Predictor</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Data</Text>
          <Button
            title="Add Training GPX"
            onPress={() => pickDocument(true)}
            disabled={loading}
          />
          
          <View style={styles.trainingList}>
            <Text style={styles.subtitle}>Trained Hikes:</Text>
            {trainingData.map((item) => (
              <View key={item.id} style={styles.trainingItemContainer}>
                <Text style={styles.trainingItem}>
                  {item.name} - {Math.round(item.completion_time)} minutes
                </Text>
                <TouchableOpacity 
                  onPress={() => deleteTrainingData(item.id)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prediction</Text>
          <Button
            title="Select Route to Predict"
            onPress={() => pickDocument(false)}
            disabled={loading}
          />
          
          {prediction && (
            <View style={styles.result}>
              <Text style={styles.resultText}>
                Estimated completion time: {Math.round(prediction)} minutes
              </Text>
            </View>
          )}
        </View>

        {loading && (
          <ActivityIndicator style={styles.loader} size="large" color="#007AFF" />
        )}

        {error && (
          <Text style={styles.error}>{error}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 30,
    fontWeight: '600',
  },
  section: {
    width: '100%',
    marginBottom: 30,
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    marginVertical: 10,
  },
  trainingList: {
    marginTop: 15,
  },
  trainingItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  trainingItem: {
    flex: 1,
    borderColor: '#007AFF',
    backgroundColor: '#e8e8e8',
    
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 5,
    borderRadius: 5,
    marginLeft: 10,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  loader: {
    marginTop: 20,
  },
  error: {
    color: '#FF3B30',
    marginTop: 20,
    padding: 10,
  },
  result: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 16,
    fontWeight: '500',
  },
});