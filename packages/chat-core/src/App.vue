<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url.prop="mastraUrl" :token.prop="token">
  </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = process.env.MASTRA_BASE_URL;

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDYsInJvbGVzIjoxOCwibG9naW4iOiLQmtC90Y_Qt9GP0L0g0K0uINCQLiIsInRhYmVsIjoiMDQ1IiwicmVtb3RlX3dvcmsiOnRydWUsImlhdCI6MTc2NDYwMDQyNSwiZXhwIjoxNzY0Njg2ODI1fQ.HRUFPFKlrxth2iH-mpjZ94gEZ1Xr_65_pe2u-jiwn8E';
</script>
