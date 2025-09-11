import { createApp } from 'vue';
import App from './App.vue';
import Ylibrary from 'sep-yui';
import 'sep-yui/styles';

const app = createApp(App);

app.use(Ylibrary).mount('#app');
