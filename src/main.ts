import { createApp } from 'vue';
import App from './App.vue';
import '@fontsource-variable/inter';
import './assets/globals.css';
import '@pksep/yui/styles';
import './router'; // Initialize the custom router

const app = createApp(App);

app.mount('#app');
