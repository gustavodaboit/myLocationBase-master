import { useState, useEffect } from "react";
import { FlatList, StyleSheet, View, Alert } from "react-native";
import {
  Appbar,
  Button,
  List,
  PaperProvider,
  Switch,
  Text,
  MD3LightTheme as DefaultTheme,
} from "react-native-paper";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';

import myColors from "./assets/colors.json";
import myColorsDark from "./assets/colorsDark.json";

const db = SQLite.openDatabaseSync('locations.db');

export default function App() {
  const [isSwitchOn, setIsSwitchOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [locations, setLocations] = useState([]);

  const [theme, setTheme] = useState({
    ...DefaultTheme,
    myOwnProperty: true,
    colors: myColors.colors,
  });

  // Inicializa o banco de dados e carrega os dados salvos
  useEffect(() => {
    db.execSync(
      'CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL, longitude REAL);'
    );
    loadDarkMode();
    loadLocations();
  }, []);

  // Efetiva a alteração do tema
  useEffect(() => {
    if (isSwitchOn) {
      setTheme({ ...theme, colors: myColorsDark.colors });
    } else {
      setTheme({ ...theme, colors: myColors.colors });
    }
  }, [isSwitchOn]);

  // pega o estado do dark mode do AsyncStorage
  async function loadDarkMode() {
    try {
      const storedTheme = await AsyncStorage.getItem('@dark_mode');
      if (storedTheme !== null) {
        setIsSwitchOn(storedTheme === 'true');
      }
    } catch (e) {
      console.error("Erro ao carregar o tema:", e);
    }
  }

  // Salva o novo estado do dark mode no AsyncStorage
  async function onToggleSwitch() {
    const newValue = !isSwitchOn;
    setIsSwitchOn(newValue);
    try {
      await AsyncStorage.setItem('@dark_mode', String(newValue));
    } catch (e) {
      console.error("Erro ao salvar o tema:", e);
    }
  }

  // Função auxiliar para perguntar ao usuário caso haja falha de captura de localização principal 
  const askToUseLastKnownLocation = () => {
    return new Promise((resolve) => {
      Alert.alert(
        'Falha na Localização',
        'Não foi possível obter a localização atual exata. Deseja utilizar a última localização conhecida do dispositivo?',
        [
          { text: 'Não', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Sim', onPress: () => resolve(true) },
        ]
      );
    });
  };

  // Solicita permissão, captura a localização real e salva no SQLite
  async function getLocation() {
    setIsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permissão Negada', 'Permita o acesso à localização para usar este recurso.');
        setIsLoading(false);
        return;
      }

      // Verifica se o serviço de GPS global do aparelho está ligado
      let providerStatus = await Location.hasServicesEnabledAsync();
      if (!providerStatus) {
        Alert.alert('GPS Desativado', 'Por favor, ative a localização do seu dispositivo.');
        setIsLoading(false);
        return;
      }

      let location;

      try {
        // Tenta pegar a posição atual como rota principal
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low, 
        });
      } catch (currentPosError) {
        console.log("Falha no getCurrentPositionAsync:", currentPosError);
        
        // Se a atual falhar, pergunta se o usuário quer a última conhecida
        const userWantsLastKnown = await askToUseLastKnownLocation();
        
        if (userWantsLastKnown) {
          location = await Location.getLastKnownPositionAsync({});
          if (!location) {
             Alert.alert('Aviso', 'Nenhuma localização prévia encontrada no dispositivo.');
             return;
          }
          console.log("Pegou a localização do getLastKnownPositionAsync");
        } else {
          // Usuário recusou usar a última conhecida, encerra a função
          return; 
        }
      }

      // Se passou pelas verificações e tem a localização
      if (location) {
        const { latitude, longitude } = location.coords;

        db.runSync(
          'INSERT INTO locations (latitude, longitude) VALUES (?, ?)',
          [latitude, longitude]
        );
        
        loadLocations(); 
      }
      
    } catch (error) {
      console.error("Erro capturado no catch:", error);
      Alert.alert('Erro inesperado', error.message || 'Falha ao capturar localização.');
    } finally {
      setIsLoading(false);
    }
  }

  // Faz a leitura das localizações salvas no banco de dados e atualiza a FlatList
  async function loadLocations() {
    setIsLoading(true);
    try {
      const allRows = db.getAllSync('SELECT * FROM locations ORDER BY id DESC');
      setLocations(allRows);
    } catch (error) {
      console.error("Erro ao carregar localizações:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <PaperProvider theme={theme}>
      <Appbar.Header>
        <Appbar.Content title="My Location" />
      </Appbar.Header>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={styles.containerDarkMode}>
          <Text style={{ color: theme.colors.onBackground }}>Dark Mode</Text>
          <Switch value={isSwitchOn} onValueChange={onToggleSwitch} />
        </View>
        
        <Button
          style={styles.containerButton}
          icon="map"
          mode="contained"
          loading={isLoading}
          onPress={getLocation}
        >
          Capturar localização
        </Button>

        <FlatList
          style={styles.containerList}
          data={locations}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <List.Item
              title={`Localização ${item.id}`}
              titleStyle={{ color: theme.colors.onBackground }}
              description={`Lat: ${item.latitude.toFixed(5)} | Lng: ${item.longitude.toFixed(5)}`}
              descriptionStyle={{ color: theme.colors.onSurfaceVariant }}
            />
          )}
        />
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  containerDarkMode: {
    margin: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  containerButton: {
    margin: 15,
  },
  containerList: {
    marginHorizontal: 15,
  },
});