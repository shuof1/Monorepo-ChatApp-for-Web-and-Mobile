import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Bubble } from 'react-native-gifted-chat';

/**
 * 自定义的聊天气泡渲染器
 */
export const renderCustomBubble = (props) => {
  const { currentMessage } = props;

  /**
   * 自定义消息文本的渲染逻辑
   * @param {object} textProps - 由 GiftedChat 的 Bubble 组件传入的 props
   */
  const renderMessageText = (textProps) => {
    // textProps 包含了文本的默认样式，如颜色（左白右黑或相反）
    // currentMessage 是我们带有自定义字段的完整消息对象
    const { currentMessage } = textProps;

    // 1. 如果消息已被删除
    if (currentMessage.deleted) {
      return (
        // 使用 textProps.textStyle 来继承默认的文本颜色
        <Text style={[styles.deletedText, textProps.textStyle]}>
          (This message was deleted)
        </Text>
      );
    }

    // 2. 如果消息被编辑过
    if (currentMessage.updatedAt) {
      return (
        // 使用嵌套 Text 来为 (edited) 标志应用不同样式
        <Text style={textProps.textStyle}>
          {currentMessage.text}
          <Text style={styles.editedText}> (edited)</Text>
        </Text>
      );
    }

    // 3. 默认情况，正常显示文本
    // 直接返回 null 或 undefined 会让 GiftedChat 使用其默认的 MessageText 组件
    // 但为了完全控制，我们自己返回一个 Text 组件
    return <Text style={textProps.textStyle}>{currentMessage.text}</Text>;
  };

  return (
    <Bubble
      {...props} // 传入所有原始 props 以保留基本功能
      wrapperStyle={{
        // 你可以根据需要自定义气泡颜色
        right: { backgroundColor: currentMessage.deleted ? "#6b7280" : "#4CAF50" },
        left: { backgroundColor: currentMessage.deleted ? "#6b7280" : "#2196F3" },
      }}
      // 使用我们自己的函数来替换掉默认的文本渲染
      renderMessageText={renderMessageText}
    />
  );
};

// 为自定义状态创建样式
const styles = StyleSheet.create({
  deletedText: {
    fontStyle: 'italic',
    // 继承自 textProps.textStyle 的颜色
  },
  editedText: {
    // 继承自 textProps.textStyle 的颜色
    fontSize: 12,
    // 你可以添加额外的样式，比如降低透明度
    opacity: 0.7,
  },
});