import { createApp } from 'vue';
import App from './App.vue';
import './assets/globals.css';
import '@fontsource-variable/inter';
import 'sep-yui/styles';
import { createPinia } from 'pinia';

const pinia = createPinia();
const app = createApp(App);

app.use(pinia).mount('#app');
