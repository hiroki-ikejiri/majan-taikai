// Firebase の設定（docs/SETUP.md の手順で取得した値）。
// 画面から誰でも見える前提の値で、データは firestore.rules の権限ルールで守る。
// null にすると「デモモード」（データはこの端末のブラウザ内だけに保存）で動く
export const firebaseConfig = {
  apiKey: 'AIzaSyCfXRgBwoDE9LHup_DqWhSEjL6gS_nYyns',
  authDomain: 'majan-taikai-8f667.firebaseapp.com',
  projectId: 'majan-taikai-8f667',
  storageBucket: 'majan-taikai-8f667.firebasestorage.app',
  messagingSenderId: '745527848939',
  appId: '1:745527848939:web:eacf8e594cb9fde0c2b3ae',
};
