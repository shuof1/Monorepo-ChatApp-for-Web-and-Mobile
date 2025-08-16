// apps/mobile/src/components/chat/ChatScreen.js
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Modal,
  TextInput,
  Pressable,
  ActionSheetIOS,
} from "react-native";
import { GiftedChat, Bubble } from "react-native-gifted-chat";
import auth from "@react-native-firebase/auth";
import { useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useChatSession } from "../../hooks/useChatSession";

export default function ChatScreen() {
  const { userId, userName } = useRoute().params || {};
  const me = auth().currentUser;

  // 从引擎 Hook 获取状态与操作
  const { messages, sendMessage, editMessage, deleteMessage } = useChatSession(userId);

  // 发送
  const onSend = useCallback(
    async (newMessages = []) => {
      const text = (newMessages[0]?.text || "").trim();
      if (text) await sendMessage(text);
    },
    [sendMessage]
  );

  // ========= 编辑弹窗（跨平台） =========
  const [editing, setEditing] = useState({ visible: false, id: null, text: "" });

  const openEdit = (msg) => {
    setEditing({ visible: true, id: msg._id, text: msg.text || "" });
  };
  const closeEdit = () => setEditing({ visible: false, id: null, text: "" });
  const saveEdit = async () => {
    if (!editing.id || !editing.text.trim()) return;
    await editMessage(editing.id, editing.text.trim());
    closeEdit();
  };

  // ========= 长按消息：编辑/删除 =========
  const doDelete = (msg) => {
    Alert.alert("Delete this message?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMessage(msg._id),
      },
    ]);
  };

  const onLongPress = (_context, message) => {
    const mine = message?.user?._id === me?.uid;
    if (!mine || message.system) return;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Edit", "Delete"],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          userInterfaceStyle: "dark",
        },
        (index) => {
          if (index === 1) openEdit(message);
          if (index === 2) doDelete(message);
        }
      );
    } else {
      // Android：用 Alert 做个简易菜单
      Alert.alert(
        "Message",
        "",
        [
          { text: "Edit", onPress: () => openEdit(message) },
          { text: "Delete", style: "destructive", onPress: () => doDelete(message) },
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true }
      );
    }
  };

  // ========= UI 渲染 =========
  const renderBubble = (props) => {
    const mine = props.currentMessage?.user?._id === me?.uid;
    const deleted = props.currentMessage?.text === "(deleted)"; // hook 已把删除态映射为占位文案
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          right: { backgroundColor: deleted ? "#6b7280" : "#4CAF50" },
          left: { backgroundColor: deleted ? "#6b7280" : "#2196F3" },
        }}
        textStyle={{
          right: { color: "#fff" },
          left: { color: "#fff" },
        }}
      />
    );
  };

  const renderTime = (props) => (
    <View style={props.containerStyle}>
      <Text
        style={{
          marginHorizontal: 10,
          marginBottom: 5,
          fontSize: 10,
          color: props.position === "left" ? "black" : "white",
        }}
      >
        {new Date(props.currentMessage.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>
    </View>
  );

  return (
    <LinearGradient colors={["#000", "#FFF"]} style={{ flex: 1 }}>
      <GiftedChat
        messages={messages}                   // 已由 hook 转 Gifted 结构，且“最新在前”
        onSend={onSend}
        user={{ _id: me?.uid, name: me?.displayName || "Me" }}
        onLongPress={onLongPress}             // ← 长按菜单
        renderBubble={renderBubble}
        renderTime={renderTime}
        renderDay={() => null}
        placeholder="Type a message …"
        textInputStyle={{ color: "white" }}
        renderUsernameOnMessage
        containerStyle={{ backgroundColor: "black", padding: 5, height: 70 }}
      />

      {Platform.OS === "android" && <KeyboardAvoidingView behavior="padding" />}

      {/* 编辑弹窗（iOS/Android 通用） */}
      <Modal
        transparent
        animationType="fade"
        visible={editing.visible}
        onRequestClose={closeEdit}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.5)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#111", borderRadius: 12, padding: 16 }}>
            <Text style={{ color: "#fff", fontWeight: "600", marginBottom: 8 }}>Edit message</Text>
            <TextInput
              value={editing.text}
              onChangeText={(t) => setEditing((s) => ({ ...s, text: t }))}
              style={{
                backgroundColor: "rgba(255,255,255,.1)",
                color: "#fff",
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
              placeholder="New text"
              placeholderTextColor="#aaa"
              autoFocus
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
              <Pressable onPress={closeEdit} style={{ paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 }}>
                <Text style={{ color: "#ddd" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#16a34a", borderRadius: 8 }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
