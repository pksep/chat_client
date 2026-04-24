# Android VOIP Call Actions

Если нативная Android-часть показывает входящий звонок через `NotificationCompat`,
кнопки `Accept` и `Decline` должны открывать приложение по deep link:

- `sepchat://call?callAction=accept&roomId=<ROOM_ID>&topicId=<TOPIC_ID>`
- `sepchat://call?callAction=decline&roomId=<ROOM_ID>&topicId=<TOPIC_ID>`

Пример на Java:

```java
Intent acceptIntent = new Intent(Intent.ACTION_VIEW,
    Uri.parse(
        "sepchat://call?callAction=accept"
            + "&roomId=" + Uri.encode(roomId)
            + "&topicId=" + Uri.encode(topicId)
    ),
    context,
    MainActivity.class
);
acceptIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

PendingIntent acceptPendingIntent = PendingIntent.getActivity(
    context,
    roomId.hashCode(),
    acceptIntent,
    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
);

Intent declineIntent = new Intent(Intent.ACTION_VIEW,
    Uri.parse(
        "sepchat://call?callAction=decline"
            + "&roomId=" + Uri.encode(roomId)
            + "&topicId=" + Uri.encode(topicId)
    ),
    context,
    MainActivity.class
);
declineIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

PendingIntent declinePendingIntent = PendingIntent.getActivity(
    context,
    roomId.hashCode() + 1,
    declineIntent,
    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
);
```

Пример для notification:

```java
NotificationCompat.Builder builder =
    new NotificationCompat.Builder(context, "incoming_call")
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle("Incoming call")
        .setContentText(callerName)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setOngoing(true)
        .setAutoCancel(false)
        .setFullScreenIntent(acceptPendingIntent, true)
        .addAction(0, "Decline", declinePendingIntent)
        .addAction(0, "Accept", acceptPendingIntent);
```

Что уже готово в приложении:

- `MainActivity` обрабатывает `callAction`, `roomId`, `topicId`
- `CallScreenPlugin` пробрасывает action в JS
- `useCallKit.ts` и `useLiveKit.ts` доводят action до `acceptCall()` или `leaveCall()`

Если нативная часть умеет слать `Intent` extras вместо URL, тоже поддерживается:

- `callAction`
- `action`
- `roomId`
- `topicId`
