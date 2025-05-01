import React, { useState, useEffect } from 'react';
import { View, Button, StyleSheet, PermissionsAndroid, Platform, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import axios from 'axios';

const App = () => {
  const [location, setLocation] = useState(null);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        getCurrentLocation();
      } else {
        Alert.alert('Permission Denied', 'Location permission is required to use this app.');
      }
    } else {
      getCurrentLocation();
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = loc.coords;
        setLocation({ latitude, longitude });
        fetchNearbyStations(latitude, longitude);
      } else {
        Alert.alert('Permission Denied', 'Location permission is required to use this app.');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const fetchNearbyStations = async (latitude, longitude) => {
    try {
      const apiKey = 'AIzaSyBTFn7WcUbYONusBeyBqzLfrUJEFi027og'; // Use your own API Key
      const radius = 20000; // 20 km radius
      const types = ['gas_station'];

      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
        {
          params: {
            location: `${latitude},${longitude}`,
            radius,
            type: 'gas_station', // Directly passing the type instead of types.join(',')
            key: apiKey,
          },
        }
      );

      console.log('Google Places API response:', response.data); // Log the response data

      if (response.data.status !== 'OK') {
        Alert.alert('API Error', response.data.status);
        return;
      }

      if (response.data.results.length === 0) {
        Alert.alert('No Stations Found', 'There are no nearby stations found.');
        return;
      }

      setStations(response.data.results);
    } catch (error) {
      console.error('Failed to fetch stations:', error);
      Alert.alert('Error', 'Could not fetch stations.');
    }
  };

  const getDistance = (loc1, loc2) => {
    const R = 6371; // Earth radius in km
    const dLat = (loc2.lat - loc1.latitude) * (Math.PI / 180);
    const dLon = (loc2.lng - loc1.longitude) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(loc1.latitude * (Math.PI / 180)) *
        Math.cos(loc2.lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // returns distance in km
  };

  const filterNearestStation = (type) => {
    const keywords = {
      EV: ['ev', 'charge', 'electric'],
      CNG: ['cng', 'compressed natural gas'],
      Petrol: ['petrol', 'fuel', 'gas'],
    };

    const filtered = stations.filter((station) => {
      const name = station.name.toLowerCase();
      return keywords[type].some((k) => name.includes(k));
    });

    if (filtered.length === 0) return null;

    filtered.sort((a, b) => {
      const distA = getDistance(location, a.geometry.location);
      const distB = getDistance(location, b.geometry.location);
      return distA - distB;
    });

    return filtered[0];
  };

  const getDirections = async (startLat, startLng, destination) => {
    try {
      const apiKey = 'AIzaSyBTFn7WcUbYONusBeyBqzLfrUJEFi027og'; // Use your own API Key
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/directions/json`,
        {
          params: {
            origin: `${startLat},${startLng}`,
            destination: `${destination.lat},${destination.lng}`,
            key: apiKey,
          },
        }
      );

      const points = decodePolyline(
        response.data.routes[0].overview_polyline.points
      );
      setRouteCoords(points);
    } catch (error) {
      console.error('Error fetching directions:', error);
    }
  };

  const decodePolyline = (t, e = 5) => {
    let points = [];
    let index = 0, lat = 0, lng = 0;

    while (index < t.length) {
      let b, shift = 0, result = 0;
      do {
        b = t.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = t.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }
    return points;
  };

  const handleFilter = (type) => {
    setFilter(type);
    if (type === 'all') {
      setSelectedStation(null);
      setRouteCoords([]);
      return;
    }

    const nearest = filterNearestStation(type);
    if (nearest) {
      setSelectedStation(nearest);
      getDirections(location.latitude, location.longitude, nearest.geometry.location);
    } else {
      setSelectedStation(null);
      setRouteCoords([]);
      Alert.alert(`No nearby ${type} station found`);
    }
  };

  return (
    <View style={styles.container}>
      {location && (
        <MapView
          style={styles.map}
          region={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={true}
        >
          {filter === 'all'
            ? stations.map((station, index) => (
                <Marker
                  key={index}
                  coordinate={{
                    latitude: station.geometry.location.lat,
                    longitude: station.geometry.location.lng,
                  }}
                  title={station.name}
                />
              ))
            : selectedStation && (
                <Marker
                  coordinate={{
                    latitude: selectedStation.geometry.location.lat,
                    longitude: selectedStation.geometry.location.lng,
                  }}
                  title={selectedStation.name}
                  pinColor="green"
                />
              )}

          {routeCoords.length > 0 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="blue"
              strokeWidth={4}
            />
          )}
        </MapView>
      )}

      <View style={styles.buttonContainer}>
        <Button title="EV Stations" onPress={() => handleFilter('EV')} />
        <Button title="CNG Stations" onPress={() => handleFilter('CNG')} />
        <Button title="Petrol Stations" onPress={() => handleFilter('Petrol')} />
        <Button title="Show All" onPress={() => handleFilter('all')} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  buttonContainer: {
    flexDirection: 'column',
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    gap: 10,
  },
});

export default App;
