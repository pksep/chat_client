#[path = "../src/desktop_notifications.rs"]
mod desktop_notifications;

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
