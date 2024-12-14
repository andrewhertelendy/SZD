import React, { useState } from 'react';
import { StyleSheet, Text, View, Button, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*'
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({
          name: asset.name,
          size: asset.size,
          uri: asset.uri
        });
        setError(null);
      }
    } catch (err) {
      setError('Error picking file: ' + err.message);
    }
  };

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <Text style={styles.title}>Hike Time Predictor</Text>

        <Button
          title="Select GPX File"
          onPress={pickDocument}
        />

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Text>Selected file:</Text>
            <Text>Name: {selectedFile.name}</Text>
            <Text>Size: {(selectedFile.size / 1024).toFixed(2)} KB</Text>
          </View>
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
    flex: 1,
    alignItems: 'center',
    paddingTop: 50,
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 30,
    fontWeight: '600',
  },
  fileInfo: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    width: '100%',
  },
  error: {
    color: '#FF3B30',
    marginTop: 20,
  },
});