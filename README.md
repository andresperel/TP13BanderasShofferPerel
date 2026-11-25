# Atlas · Trivia de banderas

Juego móvil hecho con React Native y Expo SDK 58. Para probarlo, usá **Expo Go** en un teléfono físico.

## Ejecutar en el teléfono

1. Abrí esta carpeta en Visual Studio Code y abrí la terminal integrada.
2. Instalá las dependencias (solo hace falta la primera vez):

   ```bash
   npm install
   ```

3. Iniciá Expo según el tipo de conexión:

### Si la computadora y el teléfono están en la misma Wi-Fi

```bash
npx expo start --lan
```

### Si están en redes distintas (túnel)

En **CMD** (Windows):

```bat
set NODE_USE_SYSTEM_CA=1
npx expo start --tunnel
```

En **PowerShell**:

```powershell
$env:NODE_USE_SYSTEM_CA="1"
npx expo start --tunnel
```

La opción `NODE_USE_SYSTEM_CA` hace que Node.js use los certificados de confianza instalados en Windows; no desactiva la verificación de certificados. Si el túnel pide iniciar sesión, ejecutá `npx expo login` y seguí las instrucciones.

4. Cuando aparezca el QR, escanealo desde **Expo Go**. En modo túnel, ambos dispositivos necesitan conexión a Internet, pero no estar en la misma Wi-Fi.

Para detener Expo, volvé a la terminal y presioná `Ctrl+C`.

## Funciones

- Adivinar países por sus banderas o elegir la capital correcta.
- 15 segundos por ronda; cada acierto suma 10 puntos más los segundos restantes y cada error resta 1.
- Pistas que revelan una letra o eliminan una opción y descuentan 2 segundos.
- Ranking local guardado en el dispositivo.

Los nombres, las URL de las banderas y las capitales se obtienen desde CountriesNow. Para que todas las banderas se vean en React Native, la app pide miniaturas PNG a Wikimedia usando el nombre del archivo de bandera recibido en la API. El teléfono necesita conexión a Internet.
