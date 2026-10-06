import { reactive, watch } from 'vue';

export const useNewInformationModal = (model: {
  name?: string;
  avatarUrl?: string;
}) => {
  const form = reactive({
    name: model.name || '',
    avatarUrl: model.avatarUrl || ''
  });

  const handleUpdateInformation = (information: {
    name?: string;
    avatarUrl?: string;
  }) => {
    form.name = information.name;
    form.avatarUrl = information.avatarUrl;
  };

  watch([() => model.name, () => model.avatarUrl], () => {
    if (model.name || model.avatarUrl) {
      form.name = model.name;
      form.avatarUrl = model.avatarUrl;
    }
  });
  return {
    form,
    handleUpdateInformation
  };
};
