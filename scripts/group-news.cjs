// Group related fixes into one public update, keeping installer versions intact.
function groupNews(items,groups=[]){
  const grouped=new Set();const result=[];
  for(const item of items){
    const group=groups.find(entry=>entry.versions.includes(item.releaseVersion));
    if(group){
      if(grouped.has(group.id))continue;
      grouped.add(group.id);
      result.push({id:group.id,publishedAt:item.publishedAt,title:group.title,body:group.body,action:group.action||'notifications'});
    }else{
      const {releaseVersion,...publicItem}=item;result.push(publicItem);
    }
  }
  return result;
}
module.exports={groupNews};
