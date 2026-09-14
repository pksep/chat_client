import { createApp, h, ref } from 'vue';
import { PdfPreview, Button } from '@pksep/yui';
import '@pksep/yui/styles';

const opened = ref(false);
const page = ref(1);
const error = ref('');
const onError = (value: unknown) => {
  error.value = String(value);
};
createApp({
  render: () =>
    h('div', [
      h(
        Button,
        {
          onClick: () => {
            opened.value = !opened.value;
          }
        },
        () => 'PDF'
      ),
      h(
        'button',
        {
          id: 'next-page',
          onClick: () => {
            page.value = 2;
          }
        },
        'Page 2'
      ),
      h('span', { id: 'error' }, error.value),
      h('div', { style: { width: '300px', height: '300px' } }, [
        opened.value
          ? h(PdfPreview, {
              src: '/sample.pdf',
              page: page.value,
              onError
            })
          : null
      ])
    ])
}).mount('#app');
