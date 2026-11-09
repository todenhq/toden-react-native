import type { MediaSourceOption } from '../components/MediaSourceSheet';

// The sources offered for a document, one list for every step that takes one
// (proof of address, supporting documents, company documents), so uploading
// feels the same everywhere in the flow.
//
// "Choose a file" needs `expo-document-picker`, an optional peer. Offering it in
// an app built without the package is a dead end: the applicant taps it, the
// sheet closes and they read an error about the app. So the option is left out
// and the two sources that always work remain.

//
// `withCamera: false` leaves the camera out, for a document the workflow wants
// as a file or photo already on the device (supporting documents' `file`).
export function documentSourceOptions(
  sources: { choosePhoto: () => void; takePhoto: () => void; chooseFile: () => void },
  canChooseFile: boolean,
  withCamera = true,
): MediaSourceOption[] {
  const options: MediaSourceOption[] = [
    {
      icon: 'image',
      label: 'Photo library',
      caption: 'Pick a photo you already have',
      onPress: sources.choosePhoto,
    },
    {
      icon: 'camera',
      label: 'Take a photo',
      caption: 'Photograph the document now',
      onPress: sources.takePhoto,
    },
  ];
  if (!withCamera) options.splice(1, 1);
  if (canChooseFile) {
    options.push({
      icon: 'file-text',
      label: 'Choose a file',
      caption: 'A PDF or image from your files',
      onPress: sources.chooseFile,
    });
  }
  return options;
}
