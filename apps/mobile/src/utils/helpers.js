//format timestamp 
export const formatTimestamp=(timestamp)=>{
    const date =new Date(timestamp.toMillis());
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

//generate a unique key for messages
export const generateKey=()=>{
    return Math.random().toString(36).substring(2,10);
};

// sort message based on timestamp
export const sortMessagesByTimestamp=(messages)=>{
    return messages.sort(
        (a,b)=> a.timestamp.toMillis()-b.timestamp.toMillis()
    );
};