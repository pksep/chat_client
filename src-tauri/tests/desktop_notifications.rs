#[path = "../src/desktop_notifications.rs"]
mod desktop_notifications;

#[test]
fn hand_alert_does_not_duplicate_the_sound_already_played_in_call() {
    let payload = r#"{"type":"call_activity","kind":"hand","roomId":"room","soundPlayed":true}"#;
    let xml =
        desktop_notifications::build_toast_xml("Звонок", Some("Иван поднимает руку"), payload);
    assert!(xml.contains(r#"<audio silent="true"/>"#));
    assert!(xml.contains(r#"duration="long""#));
    let fallback = payload.replace("true", "false");
    assert!(!desktop_notifications::build_toast_xml("Звонок", None, &fallback).contains("silent"));
    let reaction = payload.replace("hand", "reaction");
    assert!(!desktop_notifications::build_toast_xml("Звонок", None, &reaction).contains("silent"));
}

#[test]
fn incoming_call_buttons_keep_the_room_and_escape_xml() {
    let xml = desktop_notifications::build_toast_xml(
        "Входящий звонок",
        Some("Иван & Олег"),
        r#"{"type":"incoming_call","roomId":"room<&","topicId":"topic","url":"/dialogs/topic"}"#,
    );
    assert!(xml.contains("scenario=\"incomingCall\""));
    assert!(xml.contains("content=\"Принять\""));
    assert!(xml.contains("content=\"Отклонить\""));
    assert!(xml.contains("&quot;action&quot;:&quot;accept&quot;"));
    assert!(xml.contains("&quot;action&quot;:&quot;decline&quot;"));
    assert!(xml.contains("&quot;roomId&quot;:&quot;room&lt;&amp;&quot;"));
    assert!(xml.contains("Иван &amp; Олег"));
    assert!(!xml.contains("room<&"));
}

#[test]
fn ordinary_messages_and_invalid_call_payloads_have_no_call_buttons() {
    for payload in [
        r#"{"type":"new_message"}"#,
        r#"{"type":"incoming_call"}"#,
        "invalid",
    ] {
        let xml = desktop_notifications::build_toast_xml("<title>", None, payload);
        assert!(!xml.contains("<actions>"));
        assert!(xml.contains("&lt;title&gt;"));
        assert!(xml.contains("duration=\"short\""));
    }
}

#[test]
fn message_actions_keep_the_owner_and_target_and_support_inline_reply() {
    let payload = r#"{"type":"new_message","topicId":"topic<&","messageId":"message","accountId":"account","replyClientId":"client"}"#;
    let xml = desktop_notifications::build_toast_xml("Имя", Some("Документ: файл.pdf"), payload);
    for text in [
        "Ответить",
        "Нравится",
        "Прочитано",
        "reply_text",
        "hint-inputId",
        "topic&lt;&amp;",
    ] {
        assert!(xml.contains(text), "missing {text}");
    }
    assert_eq!(xml.matches("<action ").count(), 3);
    assert!(!xml.contains("incomingCall"));
    #[cfg(windows)]
    {
        let document = windows::Data::Xml::Dom::XmlDocument::new().unwrap();
        document
            .LoadXml(&windows::core::HSTRING::from(&xml))
            .unwrap();
        windows::UI::Notifications::ToastNotification::CreateToastNotification(&document).unwrap();
    }
    let reply = payload.replace(
        r#""type":"new_message""#,
        r#""action":"reply","type":"new_message""#,
    );
    let merged =
        desktop_notifications::with_reply_input(&reply, Some("<b>Ответ</b> & строка\nвторая"));
    let data: serde_json::Value = serde_json::from_str(&merged).unwrap();
    assert_eq!(data["replyText"], "<b>Ответ</b> & строка\nвторая");
    assert_eq!(data["replyClientId"], "client");
    assert!(!desktop_notifications::activation_needs_window(&merged));
    assert!(desktop_notifications::activation_needs_window(payload));
    assert!(desktop_notifications::activation_needs_window(
        r#"{"type":"incoming_call","action":"accept"}"#
    ));
}
