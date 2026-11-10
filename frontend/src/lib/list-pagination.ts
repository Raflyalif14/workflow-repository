export const LIST_PAGE_SIZE=10;
export function paginateList<T>(items:readonly T[],page:number,pageSize=LIST_PAGE_SIZE){
 const size=Number.isSafeInteger(pageSize)&&pageSize>0?pageSize:LIST_PAGE_SIZE;
 const total=items.length,pages=Math.max(1,Math.ceil(total/size));
 const current=Math.min(pages,Math.max(1,Number.isFinite(page)?Math.floor(page):1));
 return {page:current,pages,total,items:items.slice((current-1)*size,current*size)};
}
