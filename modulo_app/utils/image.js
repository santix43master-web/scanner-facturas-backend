import * as ImageManipulator from 'expo-image-manipulator';

export const comprimirImagen = async (uri, altaCalidad = false) => {
  try {
    const options = altaCalidad
      ? [{ resize: { width: 1600 } }]
      : [{ resize: { width: 1200 } }];
    const result = await ImageManipulator.manipulateAsync(
      uri,
      options,
      { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
};
