import { reactive, watch } from 'vue';

const form = reactive({
  name: '',
  avatarUrl: ''
});

export const useNewInformationModal = (model: {
  name: string;
  avatarUrl?: string;
}) => {
  form.name = model.name;
  form.avatarUrl = model.avatarUrl;

  const handleUpdateInformation = (information: {
    name: string;
    avatarUrl?: string;
  }) => {
    form.name = information.name;
    form.avatarUrl = information.avatarUrl;
  };

  watch([() => model.name, () => model.avatarUrl], () => {
    if (model.name || model.avatarUrl) {
      console.log('watch', model.name, model.avatarUrl);
      form.name = model.name;
      form.avatarUrl = model.avatarUrl;
    }
  });
  return {
    form,
    handleUpdateInformation
  };
};
