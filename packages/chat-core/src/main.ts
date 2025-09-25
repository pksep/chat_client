import { createApp } from 'vue';
import App from './App.vue';
import Ylibrary from 'sep-yui';
import './assets/globals.css';
import '@fontsource-variable/inter';
import 'sep-yui/styles';

const app = createApp(App);

app.use(Ylibrary).mount('#app');
